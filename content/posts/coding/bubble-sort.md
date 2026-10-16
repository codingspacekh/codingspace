---
title: Bubble sort
summary: Repeatedly swap neighbours that are out of order, with an early exit when no swaps happen.
section: algorithms
sort: 2
level: 2
lang: en
dummy: true
---

Each pass compares neighbouring items and swaps them if they are in the wrong order. After pass $k$, the largest $k$ items are in place.

```python
def bubble_sort(items):
    n = len(items)
    for end in range(n - 1, 0, -1):
        swapped = False
        for i in range(end):
            if items[i] > items[i + 1]:
                items[i], items[i + 1] = items[i + 1], items[i]
                swapped = True
        if not swapped:
            break
    return items
```

> [!CONTEST-TIP]
> The `swapped` flag makes the best case $O(n)$ on an already sorted list.
