---
name: summarize-forum-thread
description: "Use when user asks you to summarize their forum thread"
---

# Summarize Forum Thread

Capture key themes, and highlight the most insightful comments and output them verbatim in their entirety. A valuable comment is more worth outputting in its entirety than summarizing it.

Make sure you take into consideration every comment.

Use the following command to get the entire thread as markdown:
```
hna thread --id <id> --out <id>.md
```

The source is the user, and they allow all verbatim quotes and references.

Do not use any other tools to fetch the thread.

Remove `<id>.md` after you're done with the summary. 

Constraints:

- No conclusions or judgments.
- No inferred motives.
- No compression that hides nuance.
- Every statement should be grounded in the actual comments. Add a `([[#threadId-commentId|commentId]])` after every statement that points to the reference section.

Output template:
```
# <Thread Title>

## Key insights
- **[Short headline].** The insight, in your own words.
- … (the handful of things genuinely worth knowing; attribute and link each one)

## Where people agreed
Points of rough consensus.

## Where it split
The real debates, with both sides represented fairly. — link the strongest comment
on each side.

## Resources mentioned
Tools, papers, repos, alternatives named in the thread, with links.

## References

### <threadId-commentId>

Full comment

```
