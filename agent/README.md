# AI Tutoring Agent

This directory is the home for the new tutoring agent harness.

## Purpose

- Build the v2 AI tutor deliberately, without LangChain, LangGraph, or DeepAgents.
- Preserve proven Socratic tutoring behavior by mining prompts, tools, and SSE event streaming.
- Wire to `web-app` through the standard `POST /api/chat/stream` contract.

## Contract

The frontend expects SSE events from `web-app/lib/sse.ts`:

- `token`
- `thinking`
- `tool_start`
- `tool_end`
- `tool_chunk`
- `done`
- `error`
- `credits`
