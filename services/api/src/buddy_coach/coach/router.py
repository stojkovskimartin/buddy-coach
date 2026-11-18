"""HTTP endpoint for talking to the coach."""

from __future__ import annotations

from fastapi import APIRouter

from buddy_coach.coach.deps import HeadCoachDep, ToolContextDep
from buddy_coach.coach.schemas import ChatReply, ChatRequest

router = APIRouter(prefix="/coach", tags=["coach"])


@router.post("/chat", response_model=ChatReply)
async def chat(body: ChatRequest, coach: HeadCoachDep, ctx: ToolContextDep) -> ChatReply:
    """Send a message to the coach and get its answer."""
    reply = await coach.reply(body.message, ctx)
    return ChatReply(
        reply=reply.text,
        agent=reply.agent,
        tools_used=list(reply.tools_used),
        escalated=reply.escalated,
        safety_category=reply.safety_category,
        degraded=reply.degraded,
    )
