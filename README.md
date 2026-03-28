## citadelDOC

Secure file management web application with encrypted “containers”.

### Quick start

- **Install**:

```bash
npm install
```

- **Run (dev)**:

```bash
npm run dev
```

Then open the frontend shown in the terminal (default: `http://localhost:5173`).

### Security model (high level)

- **Encryption**: AES-256-GCM for file contents and container manifest.
- **Key derivation**: scrypt (Node.js `crypto.scrypt`) with per-container random salt.
- **Password storage**: master password is never persisted; only the KDF parameters + salt are stored.

### Container format (on disk)

A container is a directory with:

- `container.yaml`: non-secret metadata (name, salt, KDF parameters, version)
- `manifest.enc`: encrypted tree + file metadata (names, structure, mime, sizes)
- `blobs/<id>.bin`: encrypted file contents (each with its own random IV)

### Configuration

- **Config file**: `config/app.yaml` (recent containers, preferences).
- **Locales**: `locales/en_EN.yaml`, `locales/ru_RU.yaml`
- **Themes**: `themes/dark/`, `themes/light/`
- **Icons**: `assets/dark/*.svg`, `assets/light/*.svg`

