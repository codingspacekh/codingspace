---
title: Variables and data types
summary: Storing values in Python, the basic data types, and converting between them.
section: python-basics
sort: 1
level: 1
lang: en
dummy: true
---

A **variable** is a name that refers to a value.

```python
name = "Dara"
age = 16
height = 1.72
is_student = True
```

## Basic types

| Type | Example |
|---|---|
| `int` | `42` |
| `float` | `3.14` |
| `str` | `"hello"` |
| `bool` | `True` |

## Converting types

`input()` always returns a string, so convert it before doing maths:

```python
age = int(input("Age: "))
print(age + 1)
```

> [!NOTE]
> `int("3.5")` raises a `ValueError`. Use `float()` first if the input may have a decimal point.
