# Security Audit Context

## Scope
- OWASP Top 10 (2021)
- CWE Top 25

## Severity Levels
- P0: Remotely exploitable RCE / privilege bypass
- P1: SQL injection / XSS / sensitive data exposure
- P2: Insecure configuration / missing security headers
- P3: Code smell / best practice deviation

## Review Rules
1. All user input must be parameterized or escaped
2. Passwords must never be hardcoded
3. Session tokens must use cryptographically secure random sources
4. File uploads must validate type and size server-side
5. Error messages must not leak implementation details
