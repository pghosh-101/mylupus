# MyLupus

A personal lupus companion app: UV alerts, medication reminders, symptom and lab tracking, and an AI assistant that answers questions using your own history.

Built with React Native and Expo. Runs on iPhone through Expo Go, and exports to a web demo.

> MyLupus helps track patterns to discuss with a care team. It is not medical advice.

## Roadmap

1. **UV and sun protection.** Live hourly UV forecast (started), morning heads-up, reapply reminders.
2. **Medications.** Food and spacing rules, suggested schedule, reminders, side effects, refills.
3. **Daily log.** Symptom check-in, flare log, automatic weather and UV history.
4. **Labs.** C3, C4, anti-dsDNA, CBC and more, charted over time.
5. **Ask MyLupus.** AI chat over your own data, plus appointment prep summaries.
6. **Portfolio launch.** Demo mode with sample data and a public web version.

## Run it

```bash
npm install
npx expo start
```

Scan the QR code with the iPhone Camera app to open it in Expo Go.

UV data comes from [Open-Meteo](https://open-meteo.com/).
