---
title: The AM–GM inequality
summary: The arithmetic mean is at least the geometric mean — and why that is the most useful fact in olympiad inequalities.
section: inequalities
sort: 1
level: 1
lang: en
dummy: true
---

For non-negative reals $a$ and $b$, the **AM–GM inequality** says

$$\frac{a+b}{2} \ge \sqrt{ab},$$

with equality exactly when $a = b$.

## Proof

Since a square is never negative, $(\sqrt a - \sqrt b)^2 \ge 0$. Expanding gives $a - 2\sqrt{ab} + b \ge 0$, which rearranges to the inequality.

## The general form

For $n$ non-negative reals,

$$\frac{a_1 + a_2 + \dots + a_n}{n} \ge \sqrt[n]{a_1 a_2 \cdots a_n}.$$

> [!CONTEST-TIP]
> AM–GM is strongest when the **product** of your terms is constant. Split terms so that it is.

## Worked example

Show that $x + \dfrac{1}{x} \ge 2$ for $x > 0$.

By AM–GM on $x$ and $\frac1x$: $\dfrac{x + \frac1x}{2} \ge \sqrt{x \cdot \frac1x} = 1$.

## Problems

1. Prove that $a^2 + b^2 \ge 2ab$ for all real $a, b$.
2. For $a, b, c > 0$, prove that $(a+b)(b+c)(c+a) \ge 8abc$.
3. Find the minimum of $x + \dfrac{4}{x}$ for $x > 0$.
