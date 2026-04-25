# Deployment guide on Sawbay's infrastructure
This is instruction for deploying Condor on Sawbay's infra

Requirements:
- dokploy
- nix

Steps:
1. deploy condor as Dokploy's application
2. select deploy using nixpacks

Notes: 
- `hummingbot-api` should be deployed in the same Dokploy project with Condor. It should be exposed to the public using domain.
- Condor connection to humming-api server:
  - host: humming-api.example
  - port: 80
