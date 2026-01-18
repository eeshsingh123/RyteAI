"""
Credits Service for managing user credits via Supabase RPC.

This service uses the Supabase service role key to call the
consume_credit and refund_credit RPC functions atomically.
"""

from typing import Optional
from dataclasses import dataclass

from supabase import create_client, Client
from config import settings
from utils.logger import logger


@dataclass
class CreditResult:
    """Result of a credit operation."""
    success: bool
    credits_remaining: Optional[int] = None
    error: Optional[str] = None


class CreditsService:
    """Service for managing user credits via Supabase."""
    
    def __init__(self):
        self._client: Optional[Client] = None
    
    @property
    def client(self) -> Client:
        """Lazy initialization of Supabase client with service role key."""
        if self._client is None:
            if not settings.supabase_url or not settings.supabase_service_role_key:
                raise ValueError(
                    "Supabase URL and service role key must be configured. "
                    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables."
                )
            self._client = create_client(
                settings.supabase_url,
                settings.supabase_service_role_key
            )
        return self._client
    
    async def consume_credit(self, user_id: str, amount: int = 1) -> CreditResult:
        """
        Consume credits from a user's balance.
        
        Args:
            user_id: The Supabase user UUID
            amount: Number of credits to consume (default: 1)
            
        Returns:
            CreditResult with success status and remaining credits
        """
        try:
            # Call the consume_credit RPC function
            response = self.client.rpc(
                "consume_credit",
                {"p_user_id": user_id, "p_amount": amount}
            ).execute()
            
            if response.data:
                result = response.data
                return CreditResult(
                    success=result.get("success", False),
                    credits_remaining=result.get("credits_remaining"),
                    error=result.get("error")
                )
            else:
                return CreditResult(
                    success=False,
                    error="No response from credits service"
                )
                
        except Exception as e:
            logger.error(f"Error consuming credit for user {user_id}: {e}")
            return CreditResult(
                success=False,
                error=f"Failed to consume credit: {str(e)}"
            )
    
    async def refund_credit(self, user_id: str, amount: int = 1) -> CreditResult:
        """
        Refund credits to a user's balance.
        
        Args:
            user_id: The Supabase user UUID
            amount: Number of credits to refund (default: 1)
            
        Returns:
            CreditResult with success status and remaining credits
        """
        try:
            # Call the refund_credit RPC function
            response = self.client.rpc(
                "refund_credit",
                {"p_user_id": user_id, "p_amount": amount}
            ).execute()
            
            if response.data:
                result = response.data
                return CreditResult(
                    success=result.get("success", False),
                    credits_remaining=result.get("credits_remaining"),
                    error=result.get("error")
                )
            else:
                return CreditResult(
                    success=False,
                    error="No response from credits service"
                )
                
        except Exception as e:
            logger.error(f"Error refunding credit for user {user_id}: {e}")
            return CreditResult(
                success=False,
                error=f"Failed to refund credit: {str(e)}"
            )
    
    async def get_credits(self, user_id: str) -> Optional[int]:
        """
        Get the current credit balance for a user.
        
        Args:
            user_id: The Supabase user UUID
            
        Returns:
            The credit balance, or None if not found
        """
        try:
            response = self.client.table("profiles").select("credits").eq("user_id", user_id).single().execute()
            
            if response.data:
                return response.data.get("credits")
            return None
            
        except Exception as e:
            logger.error(f"Error getting credits for user {user_id}: {e}")
            return None


# Global credits service instance
credits_service = CreditsService()
