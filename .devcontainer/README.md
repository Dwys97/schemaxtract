# Dev Container Configuration

## Port Visibility

All service ports are automatically configured as **public** in GitHub Codespaces to allow proper CORS functionality between services.

### Configured Ports

- **3000** - Frontend (Vite) - Public
- **3001** - Backend (SAM Local) - Public
- **3002** - Donut Service - Public

### Automatic Setup

The `postStartCommand` runs `set-port-visibility.sh` on every container start to ensure ports are publicly accessible. This is critical for:

1. **CORS preflight requests** - Public ports allow proper Access-Control headers
2. **Service-to-service communication** - Frontend can call backend and Donut service
3. **External testing** - Allows testing APIs from outside the codespace

### Manual Port Visibility

If you need to manually change port visibility:

```bash
gh codespace ports visibility <port>:public -c $CODESPACE_NAME
```

Example:

```bash
gh codespace ports visibility 3002:public -c $CODESPACE_NAME
```

### Troubleshooting

If you encounter CORS errors:

1. Check port visibility:

   ```bash
   gh codespace ports -c $CODESPACE_NAME
   ```

2. Verify service is running:

   ```bash
   curl http://localhost:3002/health
   ```

3. Test public URL:

   ```bash
   curl https://<your-codespace-url>-3002.app.github.dev/health
   ```

4. Re-run the visibility script:
   ```bash
   bash .devcontainer/set-port-visibility.sh
   ```
