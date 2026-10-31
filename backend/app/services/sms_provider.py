"""
HarvestEngine: SMS Provider Adapter Interface (Phase 2, disabled by default)
Enforces:
- Abstract provider interface supporting MSG91 and Twilio adapters
- Feature-flagged: Disabled by default until explicitly configured
- Absolute compliance: Never pretend an SMS was delivered when disabled or failed
- Safe metadata logging: Records delivery ID and status without leaking credentials
- Regulatory compliance: TRAI / DLT template support and opt-out directives
"""

import logging
from abc import ABC, abstractmethod
from typing import Optional, Tuple
import httpx
from app.config import settings

logger = logging.getLogger("harvestengine.sms")


class BaseSMSProvider(ABC):
    @abstractmethod
    async def send_sms(
        self,
        to_phone: str,
        message: str,
        template_id: Optional[str] = None,
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Sends an SMS message.
        Returns:
            (success: bool, delivery_id: Optional[str], error_message: Optional[str])
        """
        pass


class DisabledSMSProvider(BaseSMSProvider):
    """
    Default provider when SMS_PROVIDER is 'disabled' or unconfigured.
    Never pretends an SMS was delivered.
    """

    async def send_sms(
        self,
        to_phone: str,
        message: str,
        template_id: Optional[str] = None,
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        logger.info(
            "SMS dispatch skipped for phone ending in ***%s: SMS_PROVIDER is 'disabled'.",
            to_phone[-4:] if len(to_phone) >= 4 else "...",
        )
        return False, None, "SMS provider is disabled in system configuration."


class MSG91Provider(BaseSMSProvider):
    """
    Adapter for MSG91 Flow API.
    Complies with Indian DLT (Distributed Ledger Technology) template regulations.
    """

    def __init__(self, api_key: str, sender_id: str):
        self.api_key = api_key
        self.sender_id = sender_id
        self.endpoint = "https://api.msg91.com/api/v5/flow/"

    async def send_sms(
        self,
        to_phone: str,
        message: str,
        template_id: Optional[str] = None,
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        if not self.api_key:
            return False, None, "MSG91 API key is not configured."

        payload = {
            "template_id": template_id or "HARVEST_GENERAL_ALERT",
            "sender": self.sender_id,
            "short_url": "0",
            "recipients": [
                {
                    "mobiles": f"91{to_phone[-10:]}",
                    "message": message,
                }
            ],
        }
        headers = {
            "authkey": self.api_key,
            "content-type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.post(self.endpoint, json=payload, headers=headers)
                data = res.json()
                if res.status_code == 200 and data.get("type") == "success":
                    request_id = data.get("message")
                    return True, str(request_id), None
                else:
                    err_msg = data.get("message", "MSG91 delivery rejected")
                    return False, None, f"MSG91 error: {err_msg}"
        except Exception as exc:
            logger.error("MSG91 request exception: %s", exc)
            return False, None, f"Network exception: {str(exc)}"


class TwilioProvider(BaseSMSProvider):
    """
    Adapter for Twilio Programmable SMS API.
    """

    def __init__(self, account_sid: str, auth_token: str, from_phone: str):
        self.account_sid = account_sid
        self.auth_token = auth_token
        self.from_phone = from_phone
        self.endpoint = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"

    async def send_sms(
        self,
        to_phone: str,
        message: str,
        template_id: Optional[str] = None,
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        if not self.account_sid or not self.auth_token or not self.from_phone:
            return False, None, "Twilio credentials are incomplete in configuration."

        formatted_to = f"+91{to_phone[-10:]}"
        payload = {
            "To": formatted_to,
            "From": self.from_phone,
            "Body": message,
        }

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.post(
                    self.endpoint,
                    data=payload,
                    auth=(self.account_sid, self.auth_token),
                )
                data = res.json()
                if res.status_code in (200, 201):
                    sid = data.get("sid")
                    return True, str(sid), None
                else:
                    err_msg = data.get("message", "Twilio rejected message")
                    return False, None, f"Twilio error: {err_msg}"
        except Exception as exc:
            logger.error("Twilio request exception: %s", exc)
            return False, None, f"Network exception: {str(exc)}"


def get_sms_provider() -> BaseSMSProvider:
    """Factory selecting the configured SMS provider adapter."""
    provider_type = (settings.SMS_PROVIDER or "disabled").lower().strip()

    if provider_type == "msg91" and settings.SMS_API_KEY:
        return MSG91Provider(api_key=settings.SMS_API_KEY, sender_id=settings.SMS_SENDER_ID)
    elif provider_type == "twilio" and settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN:
        return TwilioProvider(
            account_sid=settings.TWILIO_ACCOUNT_SID,
            auth_token=settings.TWILIO_AUTH_TOKEN,
            from_phone=settings.TWILIO_PHONE_NUMBER or "",
        )
    return DisabledSMSProvider()
