# Vendored from anthropics/claude-code's .devcontainer/Dockerfile (U-004), with these
# deltas from the upstream source:
#   - zsh-in-docker / powerline10k and git-delta are dropped: nothing here runs an
#     interactive shell, so the terminal ergonomics upstream installs them for do not apply.
#   - The VS Code Dev Containers ergonomics (bash-history persistence volume, the
#     DEVCONTAINER orientation env var, and the zsh/nano SHELL·EDITOR·VISUAL defaults) are
#     dropped for the same reason: this image is never opened as a devcontainer.
#   - `sudo` is not installed and no sudoers file is written for node: entrypoint.sh (U-003)
#     is the container's root ENTRYPOINT, and it alone runs init-firewall.sh before
#     demoting to node via gosu, so node never needs, and never gets, a path back to root.
#   - `gosu` is added (apt has it directly on this base image's Debian release) for that
#     entrypoint.sh demotion step.
#   - ENTRYPOINT is entrypoint.sh, started as root, so the same image can hand off to
#     whichever agent's exec command agents.sh (U-001) names for the argument it is given;
#     CMD defaults that argument to claude, and codex (U-009) reuses this same image without
#     a Dockerfile change beyond adding its own install step.
FROM node:20

ARG TZ
ENV TZ="$TZ"

ARG CLAUDE_CODE_VERSION=latest

# Install basic development tools and iptables/ipset/gosu.
RUN apt-get update && apt-get install -y --no-install-recommends \
  less \
  git \
  procps \
  fzf \
  man-db \
  unzip \
  gnupg2 \
  gh \
  iptables \
  ipset \
  gosu \
  iproute2 \
  dnsutils \
  aggregate \
  jq \
  nano \
  vim \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Ensure default node user has access to /usr/local/share
RUN mkdir -p /usr/local/share/npm-global && \
  chown -R node:node /usr/local/share

# Create workspace and config directories and set permissions. /home/node/.claude is the
# auth directory agents.sh (U-001) names for the claude agent.
RUN mkdir -p /workspace /home/node/.claude && \
  chown -R node:node /workspace /home/node/.claude

WORKDIR /workspace

# Set up non-root user
USER node

# Install global packages
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# Install Claude
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# Hand off to entrypoint.sh (U-003), which runs as root: it applies the firewall
# (init-firewall.sh, U-002) directly as the container's own PID 1, and only on success
# demotes to node (gosu) before exec-ing the agent's command (agents.sh, U-001). No sudoers
# file is written for node; root is the one process that ever runs init-firewall.sh.
USER root
COPY agents.sh init-firewall.sh entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/agents.sh /usr/local/bin/init-firewall.sh /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["claude"]
