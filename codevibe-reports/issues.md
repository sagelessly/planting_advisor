AI Usage Tracking Incorrectly Counts Pasting Content into Non-Code Files as Agentic Work

## Description

The CodeVibe VS Code extension appears to track AI usage and agentic work even when interacting with files that do not contain source code, such as JSON files.

For example, when I pasted a large block of JSON data into my two json files, the extension recorded the activity as Agentic Work because multiple lines of content are pasted into the editor.

However, this activity is not necessarily AI-assisted coding or agentic development. JSON files are often used to store static data, configuration values, datasets, and other structured information. 

This resulted in inaccurate AI usage statistics and an incorrect representation of how much work was actually performed using AI.

## Suggested Improvements

The extension should distinguish between actual AI-assisted development activities and ordinary editor interactions.

In particular:
- Pasting content into JSON files should not automatically be classified as Agentic Work.
- The extension should distinguish between manually pasted content and content generated or inserted through an AI agent.
- AI usage tracking should ideally consider the source and context of an edit rather than relying primarily on the number of lines inserted.
- Non-code files, including JSON datasets and configuration files, should have appropriate tracking rules so that ordinary data entry does not inflate AI usage statistics.
