# Hostel Management System — Backend

The backend API server (Node ESM · Express · Mongoose 9 · MongoDB) for the Hostel
Management System.

## 📖 Documentation

**[STRUCTURE_GUIDE.md](STRUCTURE_GUIDE.md) is the single source of truth** — setup, architecture,
conventions, the model-ownership rules, authorization, design principles, and history all
live there. Read it before making changes; add any new rules there.

## 🚀 Quick start

```bash
npm install
cp .env.example .env      # fill in — required: MONGO_URI, SESSION_SECRET
npm run dev               # or `npm start` for production
npm run check:boundary    # must stay green (the model-ownership guardrail)
```

See [STRUCTURE_GUIDE.md → Quick Start](STRUCTURE_GUIDE.md) for prerequisites and the full checklist.

## License

ISC — © Devesh Kumar Yadav ([@thisisdkyadav](https://github.com/thisisdkyadav))
