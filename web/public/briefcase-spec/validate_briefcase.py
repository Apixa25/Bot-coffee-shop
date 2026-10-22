#!/usr/bin/env python3
"""Validate a Bot Coffee Shop briefcase (spec v1).

Usage: python3 validate_briefcase.py <briefcase_dir> [--json]
Exit 0 = valid (warnings allowed), 1 = errors found, 2 = bad usage.
Only uses the standard library; uses `jsonschema` too if it's installed.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
MAX_FILE_BYTES = 256 * 1024
MAX_SKILL_BYTES = 2 * 1024 * 1024
ALLOWED_EXT = {".md", ".json", ".txt", ".py", ".js", ".ts", ".sh", ".yaml", ".yml", ".csv"}
SCRIPT_EXT = {".py", ".js", ".ts", ".sh"}

SECRET_PATTERNS = [
    ("OpenAI/Anthropic-style key", r"\bsk-(?:ant-|proj-)?[A-Za-z0-9_\-]{20,}"),
    ("xAI key", r"\bxai-[A-Za-z0-9]{20,}"),
    ("AWS access key id", r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"),
    ("GitHub token", r"\bgh[pousr]_[A-Za-z0-9]{30,}"),
    ("Slack token", r"\bxox[abprs]-[A-Za-z0-9-]{10,}"),
    ("Google API key", r"\bAIza[0-9A-Za-z_\-]{35}"),
    ("Stripe key", r"\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}"),
    ("Private key block", r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    ("JWT", r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"),
    ("Bearer token", r"(?i)\bbearer\s+[A-Za-z0-9._\-]{20,}"),
    ("Password assignment", r"(?i)\b(?:password|passwd|pwd|secret|api[_-]?key|token)\s*[:=]\s*['\"]?[^\s'\"<>{}$]{6,}"),
    ("Credential in URL", r"[a-z]+://[^/\s:@]+:[^/\s@]+@"),
]
PII_PATTERNS = [
    ("Email address", r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    ("Phone number", r"(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)"),
    ("Street address", r"\b\d{1,5}\s+[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Lane|Ln|Dr|Drive|Ct|Court)\b"),
    ("SSN", r"\b\d{3}-\d{2}-\d{4}\b"),
    ("Card number", r"\b(?:\d[ -]?){13,16}\b"),
    ("Home-directory path", r"/(?:home|Users)/[A-Za-z0-9._-]+/"),
    ("IP address", r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
]
INJECTION_PATTERNS = [
    ("Override instruction", r"(?i)ignore (?:all |any )?(?:previous|prior|above) (?:instructions|rules)"),
    ("Exfiltration hint", r"(?i)(?:send|upload|post|email)\b.{0,40}\b(?:api key|password|credentials|secrets|\.env|ssh key)"),
    ("Hidden-from-owner hint", r"(?i)(?:don't|do not|never) (?:tell|inform|show) (?:the |your )?(?:user|owner|human)"),
    ("Remote code pipe", r"(?i)(?:curl|wget)[^\n|]{0,200}\|\s*(?:ba|z)?sh"),
    ("Dynamic eval", r"\b(?:eval|exec)\s*\("),
]
EMAIL_ALLOW = re.compile(r"(?i)@(example\.(?:com|org|net)|thegathrd\.com|botcoffeeshop\.com)$")
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{2,63}$")
SEMVER = re.compile(r"^\d+\.\d+\.\d+$")


class Report:
    def __init__(self):
        self.errors, self.warnings = [], []
    def err(self, where, msg): self.errors.append(f"{where}: {msg}")
    def warn(self, where, msg): self.warnings.append(f"{where}: {msg}")


def load_json(path, rep, where):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        rep.err(where, "missing file")
    except json.JSONDecodeError as e:
        rep.err(where, f"invalid JSON ({e})")
    return None


def schema_check(data, schema_name, rep, where):
    schema_path = os.path.join(HERE, "schemas", schema_name)
    try:
        import jsonschema
    except ImportError:
        jsonschema = None
    if jsonschema:
        with open(schema_path) as f:
            schema = json.load(f)
        v = jsonschema.Draft202012Validator(schema)
        for e in sorted(v.iter_errors(data), key=lambda e: list(e.path)):
            loc = "/".join(str(p) for p in e.path) or "(root)"
            rep.err(where, f"schema: {loc}: {e.message}")
        return
    # Minimal fallback: required top-level keys
    with open(schema_path) as f:
        schema = json.load(f)
    for k in schema.get("required", []):
        if k not in data:
            rep.err(where, f"missing required field '{k}'")


def parse_frontmatter(text):
    if not text.startswith("---"):
        return None
    end = text.find("\n---", 3)
    if end == -1:
        return None
    block, fm, key = text[3:end], {}, None
    for line in block.splitlines():
        m = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", line)
        if m:
            key, val = m.group(1), m.group(2).strip()
            fm[key] = "" if val in (">-", ">", "|", "|-") else val
        elif key and line.startswith((" ", "\t")):
            fm[key] = (fm[key] + " " + line.strip()).strip()
    return fm


def scan_text(text, rel, rep):
    for label, pat in SECRET_PATTERNS:
        for m in re.finditer(pat, text):
            snippet = m.group(0)
            if re.search(r"<[^>]+>|\$\{?[A-Z_]+|YOUR_|EXAMPLE|xxxx|\*\*\*", snippet):
                continue  # placeholders are fine
            rep.err(rel, f"possible secret ({label}) near line {text[:m.start()].count(chr(10))+1}")
    for label, pat in PII_PATTERNS:
        for m in re.finditer(pat, text):
            s = m.group(0)
            if label == "Email address" and EMAIL_ALLOW.search(s):
                continue
            if label == "IP address" and (s.startswith(("127.", "0.", "10.", "192.168.")) or any(int(p) > 255 for p in s.split("."))):
                continue
            rep.err(rel, f"possible personal info ({label}) near line {text[:m.start()].count(chr(10))+1}")
    for label, pat in INJECTION_PATTERNS:
        for m in re.finditer(pat, text):
            rep.warn(rel, f"needs human review ({label}) near line {text[:m.start()].count(chr(10))+1}")


def check_skill(root, entry, rep):
    sid = entry.get("id", "?")
    sdir = os.path.join(root, entry.get("path", "").rstrip("/"))
    where = f"skills/{sid}"
    if not os.path.isdir(sdir):
        rep.err(where, f"folder '{entry.get('path')}' listed in briefcase.json does not exist")
        return
    if os.path.basename(sdir) != sid:
        rep.err(where, "folder name must equal the skill id")
    # SKILL.md
    skill_md = os.path.join(sdir, "SKILL.md")
    if not os.path.isfile(skill_md):
        rep.err(where, "missing SKILL.md")
    else:
        text = open(skill_md, encoding="utf-8", errors="replace").read()
        fm = parse_frontmatter(text)
        if fm is None:
            rep.err(f"{where}/SKILL.md", "missing --- frontmatter --- block")
        else:
            if not fm.get("name"):
                rep.err(f"{where}/SKILL.md", "frontmatter needs 'name'")
            if not fm.get("description"):
                rep.err(f"{where}/SKILL.md", "frontmatter needs 'description' (when to use it)")
            elif not re.search(r"(?i)\buse (this|it|when)\b|\bwhen\b", fm["description"]):
                rep.warn(f"{where}/SKILL.md", "description should say WHEN to use the skill")
        body = text.split("\n---", 2)[-1] if fm else text
        if not re.search(r"(?m)^\s*(?:\d+\.|-|\*)\s+\S", body):
            rep.warn(f"{where}/SKILL.md", "no step-by-step list found in the recipe")
    # EXAMPLE.md
    if not os.path.isfile(os.path.join(sdir, "EXAMPLE.md")):
        rep.err(where, "missing EXAMPLE.md (worked example of real use)")
    # label.json
    label = load_json(os.path.join(sdir, "label.json"), rep, f"{where}/label.json")
    if isinstance(label, dict):
        schema_check(label, "label.schema.json", rep, f"{where}/label.json")
        if label.get("id") != sid:
            rep.err(f"{where}/label.json", "id must match briefcase.json entry")
        if label.get("version") != entry.get("version"):
            rep.err(f"{where}/label.json", "version must match briefcase.json entry")
        sc = label.get("secrets_check", {})
        if sc.get("passed") is not True:
            rep.err(f"{where}/label.json", "secrets_check.passed must be true")
        if not sc.get("owner_approved"):
            rep.warn(f"{where}/label.json", "owner has not approved sharing this skill yet")
        u = label.get("usage", {})
        if isinstance(u.get("successes"), int) and isinstance(u.get("count"), int) and u["successes"] > u["count"]:
            rep.err(f"{where}/label.json", "usage.successes cannot exceed usage.count")
    # walk files
    total, has_scripts = 0, False
    for dp, dns, fns in os.walk(sdir):
        dns[:] = [d for d in dns if not d.startswith(".")]
        for fn in fns:
            fp = os.path.join(dp, fn)
            rel = os.path.relpath(fp, root)
            if os.path.islink(fp):
                rep.err(rel, "symlinks are not allowed"); continue
            if fn.startswith(".") :
                rep.err(rel, "hidden files are not allowed (.env, .git etc.)"); continue
            ext = os.path.splitext(fn)[1].lower()
            if ext not in ALLOWED_EXT:
                rep.err(rel, f"file type '{ext or 'none'}' not allowed (text only)"); continue
            size = os.path.getsize(fp)
            total += size
            if size > MAX_FILE_BYTES:
                rep.err(rel, f"file too large ({size} bytes > {MAX_FILE_BYTES})")
            if ext in SCRIPT_EXT:
                has_scripts = True
                if not rel.split(os.sep)[2:3] == ["scripts"]:
                    rep.warn(rel, "helper scripts belong in the skill's scripts/ folder")
            try:
                text = open(fp, encoding="utf-8").read()
            except UnicodeDecodeError:
                rep.err(rel, "not UTF-8 text"); continue
            scan_text(text, rel, rep)
    if total > MAX_SKILL_BYTES:
        rep.err(where, f"skill folder too large ({total} bytes)")
    if has_scripts and not entry.get("has_scripts"):
        rep.err(where, "contains scripts, so briefcase.json must say has_scripts: true")


def validate(root):
    rep = Report()
    if not os.path.isdir(root):
        rep.err(root, "not a folder"); return rep
    for req in ("briefcase.json", "README.md"):
        if not os.path.isfile(os.path.join(root, req)):
            (rep.err if req == "briefcase.json" else rep.warn)(req, "missing")
    bc = load_json(os.path.join(root, "briefcase.json"), rep, "briefcase.json")
    if not isinstance(bc, dict):
        return rep
    schema_check(bc, "briefcase.schema.json", rep, "briefcase.json")
    if not str(bc.get("spec_version", "")).startswith("1."):
        rep.err("briefcase.json", "this validator understands spec_version 1.x only")
    seen = set()
    for entry in bc.get("skills", []) or []:
        sid = entry.get("id")
        if sid in seen:
            rep.err("briefcase.json", f"duplicate skill id '{sid}'")
        seen.add(sid)
        if not (isinstance(sid, str) and ID_RE.match(sid)):
            rep.err("briefcase.json", f"bad skill id '{sid}'"); continue
        if not SEMVER.match(str(entry.get("version", ""))):
            rep.err("briefcase.json", f"{sid}: version must be x.y.z")
        check_skill(root, entry, rep)
    # anything in skills/ not listed?
    sk = os.path.join(root, "skills")
    if os.path.isdir(sk):
        for d in os.listdir(sk):
            if os.path.isdir(os.path.join(sk, d)) and d not in seen:
                rep.err(f"skills/{d}", "folder not listed in briefcase.json")
    for fn in ("briefcase.json", "README.md"):
        p = os.path.join(root, fn)
        if os.path.isfile(p):
            scan_text(open(p, encoding="utf-8", errors="replace").read(), fn, rep)
    return rep


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    if len(args) != 1:
        print(__doc__); return 2
    rep = validate(args[0])
    ok = not rep.errors
    if "--json" in argv:
        print(json.dumps({"valid": ok, "errors": rep.errors, "warnings": rep.warnings}, indent=2))
    else:
        for e in rep.errors: print("ERROR  ", e)
        for w in rep.warnings: print("WARN   ", w)
        print(f"\n{'VALID' if ok else 'INVALID'}: {len(rep.errors)} error(s), {len(rep.warnings)} warning(s)")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
