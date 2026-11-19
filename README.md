# MyLupus

A personal lupus companion app: UV alerts, medication reminders, symptom and lab tracking, and an AI assistant that answers questions using your own history.

Built with React Native and Expo. Runs on iPhone through Expo Go, and exports to a web demo.

> MyLupus helps track patterns to discuss with a care team. It is not medical advice.

## Features

1. **UV and sun protection.** Live UV (WeatherAPI.com) with auto-refresh, a city picker, an 8 AM UV notification, and sunscreen reapply reminders.
2. **Medications.** Food and spacing rules, suggested schedules, reminders that adjust to when doses were actually taken, and refill reminders.
3. **Daily log.** Morning sleep and evening check-ins, flare history, Raynaud's log, automatic weather, and a weekly pattern report computed on the phone.
4. **Labs.** Scan lab reports with Claude (Haiku 5.5) or type them in, charts with normal ranges, and doctor's notes.
5. **Ask MyLupus.** A chat assistant (Claude Sonnet 5.5) that answers questions about the user's own logged history.
6. **Portfolio launch** (next). Demo mode with sample data and a public web version.

All health data stays on the device. Claude features need an API key in `.env.local` (see `.env.example`).

## Run it

```bash
npm install
npx expo start
```

Scan the QR code with the iPhone Camera app to open it in Expo Go.

UV data comes from [Open-Meteo](https://open-meteo.com/).
