# Security Policy

[日本語](SECURITY.md)

## Reporting a Vulnerability

If you discover a security vulnerability in AITuberFlow, please report it responsibly.

### How to Report

1. **Do NOT** open a public issue for security vulnerabilities
2. Send details to the maintainers via private message or email
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- Acknowledgment within 48 hours
- Status update within 7 days
- Credit in the security advisory (if desired)

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| 0.x     | No        |

## Security Best Practices for Users

### API Keys

- Never commit API keys to version control
- Use environment variables (`.env` files)
- Keep `.env` files in `.gitignore`

### Network Configuration

- Run behind a reverse proxy in production
- Use HTTPS for all external connections
- Restrict CORS origins to trusted domains

### OBS Integration

- Use strong passwords for OBS WebSocket
- Limit network access to localhost when possible

## Known Security Considerations

### Local Development

This project is designed primarily for local development and personal streaming setups. Additional security hardening is recommended for any public-facing deployment.

### Plugin System

Plugins execute Python code. Only install plugins from trusted sources.
