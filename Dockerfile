# Jules Worker Container
# Runs OpenCode to execute coding tasks

FROM node:22-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install OpenCode (download binary from GitHub releases)
ARG OPENCODE_VERSION=1.1.16
RUN curl -fsSL "https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/opencode-linux-x64.tar.gz" \
    | tar xz -C /usr/local/bin \
    && chmod +x /usr/local/bin/opencode

# Create workspace directory
WORKDIR /workspace

# Copy entrypoint script
COPY worker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Copy agent prompt
COPY worker/agent-prompt.md /agent-prompt.md

ENTRYPOINT ["/entrypoint.sh"]
