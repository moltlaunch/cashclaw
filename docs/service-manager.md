# Service Manager Integration

CashClaw integrates with the agent-gateway universal service manager.

## Registration

Run the registration script to add cashclaw to the service registry:

```bash
bash scripts/register-service.sh
```

This copies `config/service.yaml` to `~/.agent-gateway/services.d/cashclaw.yaml`.

## Management

After registration, use the service manager to control cashclaw:

```bash
service-manager status          # view all services
service-manager health          # HTTP health checks
service-manager restart cashclaw
service-manager logs cashclaw
```

## Health endpoint

cashclaw exposes a health API at `http://localhost:3777/api/status`.
