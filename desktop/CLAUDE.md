We're building a documentation parser using LLMs and proxy urls to recursively fetch and crawl webpages when given a path.

Features:
    - Use turndown to convert HTML to Markdown
    - Uses gpt-4o-mini to cleanup, chunk, and rewrite the markdown from each page.
    - Uses text-embedding-3-large to embed the files for vector search.

You should be able to give paths that each collected URL must begin with.
You should be able to give anti-paths and anti-keywords that do not add any collected URLs to the crawler queue.

For example, if we want to crawl the v2 tauri webpages and build a cleanedup documentation for it:

Prefix path: https://v2.tauri.app

However, we wouldn't want the link to include "release" in it, because that would cause it to recursively crawl the docs for older releases, so https://v2.tauri.app/release/ would not be added to the queue.

We also might want to add "blog" to the anti-keywords, because we don't really care for the blog posts.

The technology stack is:
    - Tauri v2
    - React 18
    - ShadCN
    - SQLite with vector add-on using the Tauri embedded SQLite plugin
    - Vite

Do not edit or modify anything in the database in terms of locking, WAL, asynchronous, retries, etc. The plugin already handles all of that for you. If there's errors, it's more than likely because you're over-complicating it. Keep it simple.

The auto-updating proxy list is at: https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt
We should rotate which proxy list we use on each try.
We should have a refresh button that refreshes the entire list of proxies in the database and removes any in the database that aren't in the new list.
We should keep track of when we use it in the database so that when we've gone through all of them, we start using the oldest ones first.

We should first crawl the pages for the links first before parsing. There should be a list of all the available links found in alphabetical order. We should then be able to filter it in real-time and select/deselect links because we probably won't know all the available paths ahead of time and some of them could lead to something like "releases" or something which would ruin everything.

We will save the user's OpenAI key in the database and we need it before we start converting the crawled markdown.

We should be able to set a title and version so that we can save each run and everything for future use so that we can go back to it later on.