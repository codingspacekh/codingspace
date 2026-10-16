---
title: Linear search
summary: Check each item in turn — in 9618 pseudocode and in Python.
section: algorithms
sort: 1
level: 1
lang: en
dummy: true
---

A **linear search** checks each item in turn until it finds the target or reaches the end.

## Pseudocode (9618)

```pseudocode
FUNCTION LinearSearch(Items : ARRAY OF INTEGER, Target : INTEGER) RETURNS INTEGER
    FOR Index ← 1 TO LENGTH(Items)
        IF Items[Index] = Target THEN
            RETURN Index
        ENDIF
    NEXT Index
    RETURN -1
ENDFUNCTION
```

## Python

```python
def linear_search(items, target):
    for i, item in enumerate(items):
        if item == target:
            return i
    return -1
```

> [!EXAM-TIP]
> Arrays in 9618 pseudocode start at 1 unless the question says otherwise.

## Efficiency

- Best case: $O(1)$ — the target is first.
- Worst case: $O(n)$ — the target is last or missing.
