# Tamidoc web app

The web app uses React and Vite. The default build includes Community screens. In the private development repository, `VITE_TAMIDOC_EDITION=enterprise` adds Enterprise screens; that source code is absent from the public Community distribution.

```bash
npm ci
npm run dev
```

By default, Vite runs at `http://localhost:5173` and proxies `/api` requests to the backend at `http://localhost:3001`. The app uses `/api/v1` when `VITE_API_URL` is unset.

Build with `npm run build` and run tests with `npm test`.

The Community distribution is licensed under Apache-2.0. Enterprise implementations remain proprietary.
