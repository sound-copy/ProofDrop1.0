# 🔧 Codex–GitHub Maintenance Checklist

Quarterly (or after major auth changes) confirm that Codex CLI, GitHub, and CI remain healthy, secure, and current.

---

### 1. Tokens & Keys
- **Fine-grained PAT:** rotate; re-login with `gh auth login --with-token`
- **OpenAI API Key:** rotate secret in `ci-codex`
- **SSH Key:** keep one per machine; remove stale

---

### 2. Local Cleanup
rm -f ~/.config/gh/hosts.yml.old ~/.config/gh/hosts.yml.bak
git credential-cache exit

---

### 3. CI / Environment Audit
Check GitHub → Settings → Security → Audit log → filter: `environment:ci-codex`

---

### 4. Dependencies
brew upgrade codex || npm update -g @openai/codex

---

### 5. Branch & Ruleset
Verify “Main Protection” Ruleset active; `codex-review` required check present.

---

**Expected healthy state**
- gh auth status → Logged in
- ssh -T git@github.com → authenticated
- codex-review → green
- no redundant tokens
