---
title: The Cauchy–Schwarz inequality
summary: A sum of products is at most the product of the square roots — and the Engel form that solves fraction problems.
section: inequalities
sort: 2
level: 2
lang: en
dummy: true
---

For real numbers $a_1, \dots, a_n$ and $b_1, \dots, b_n$,

$$(a_1 b_1 + \dots + a_n b_n)^2 \le (a_1^2 + \dots + a_n^2)(b_1^2 + \dots + b_n^2).$$

## Proof idea

The quadratic $f(t) = \sum (a_i t - b_i)^2$ is never negative, so its discriminant is at most $0$. Writing out the discriminant gives the inequality.

## Engel form (Titu's lemma)

For $y_i > 0$:

$$\frac{x_1^2}{y_1} + \dots + \frac{x_n^2}{y_n} \ge \frac{(x_1 + \dots + x_n)^2}{y_1 + \dots + y_n}.$$

> [!NOTE]
> Reach for the Engel form whenever you see a sum of fractions with squares on top.

## Problems

1. Prove that $(a + b + c)\left(\frac1a + \frac1b + \frac1c\right) \ge 9$ for $a, b, c > 0$.
2. If $x + y + z = 1$ with $x, y, z > 0$, find the minimum of $\frac{1}{x} + \frac{4}{y} + \frac{9}{z}$.
