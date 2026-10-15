# Agent Context: IndicContextKeyboard

This repository combines:

1. A React Native (TypeScript) application layer under `src/`
2. Native Android background/service components for:
   - Input Method Editor (custom keyboard)
   - Accessibility context extraction

## Important Guidance for Future AI Agents

- Keep business logic in TypeScript where feasible.
- Keep Android services lightweight and focused on lifecycle + platform integration.
- Use clear interfaces between native modules and TypeScript services for STT/LLM flows.
- Avoid implementing full production logic in stubs unless explicitly requested.
