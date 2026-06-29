FROM node:20-slim

RUN apt-get update && apt-get install -y git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g opencode-ai

WORKDIR /workspace

# GITHUB_REPO is passed at run time, e.g. "owner/repo"
CMD ["sh", "-c", "git clone https://github.com/${GITHUB_REPO} . && opencode serve --hostname 0.0.0.0 --port 4096"]
