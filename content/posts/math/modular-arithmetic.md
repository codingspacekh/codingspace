---
title: Modular arithmetic
summary: Working with remainders — congruences, their rules, and fast powers.
section: number-theory
sort: 1
level: 1
lang: en
dummy: true
---

We write $a \equiv b \pmod n$ when $n$ divides $a - b$.

## Rules

If $a \equiv b$ and $c \equiv d \pmod n$, then

- $a + c \equiv b + d \pmod n$
- $ac \equiv bd \pmod n$
- $a^k \equiv b^k \pmod n$ for every $k \ge 1$

> [!WARNING]
> You **cannot** always divide: $2 \cdot 3 \equiv 2 \cdot 1 \pmod 4$, but $3 \not\equiv 1 \pmod 4$.

## Worked example

Find the last digit of $7^{2026}$.

Powers of $7$ modulo $10$ repeat with period $4$: $7, 9, 3, 1$. Since $2026 \equiv 2 \pmod 4$, the last digit is $9$.

## Problems

1. Find the remainder when $2^{100}$ is divided by $7$.
2. Show that $n^2 \equiv 0$ or $1 \pmod 4$ for every integer $n$.
