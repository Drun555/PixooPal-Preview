<img width="2652" height="1380" alt="image" src="https://github.com/user-attachments/assets/f2779396-2270-4845-a317-7819b9f8b460" />
I really should recapture this screen after fixing font rendering in SDK. And errors right at front image? What a great way to introduce a tool.

# PixooPal Preview

... Is a tool that was created to simplify the process of creating a new clockface for your Pixoo / PixooPal.


Basically, this tool is doing two things:
- It creates a new clockface folder with Example
- Runs a live-preview server

Quick start:
```bash
npx @pixoopal/preview create
cd {MyClockfaceName}
npm install
npx @pixoopal/preview run
-- The preview server defaults to `127.0.0.1:4174`. You can use `--host` and `--port` to override it.
```

## Using the Clockface

For personal use, you can always just copy your ./build-* folder inside PixooPal/data/CommunityClockfaces. It should instantly appear in the list.


And if you think you did a great job and want to share your new fancy clockface, you can:
- https://github.com/Drun555/PixooPal-Community <- create an issue here with attached clockface sources
- Or, if you are a cool hacker boy, you can fork it, put your clockface inside /src and make a PR.
