# CrazyGames submission kit

Everything needed to submit Swing or Splash at https://developer.crazygames.com.

| File | What it is |
|---|---|
| `swing-or-splash-crazygames.zip` | The game build to upload. `index.html` is at the root of the zip and includes the CrazyGames SDK v3 script tag |
| `build/` | The same files unzipped, for checking in the CrazyGames QA tool or on a local server |
| `STORE_LISTING.md` | Title, description, controls, category, tags and answers for the submission form |
| `media/cover-*.png` | The three required covers: 1920x1080, 800x1200, 800x800 |
| `media/preview-*.mp4` | The two preview videos: landscape 1920x1080 and portrait 1080x1620, 15 to 20 seconds, no sound |
| `media/reference/` | Clean in-game shots to attach when generating extra thumbnails |
| `THUMBNAIL_PROMPTS.md` | Ready-to-paste ChatGPT prompts for extra thumbnails |

## Rebuilding the zip

```
npm run build:crazygames
```

This runs the normal build, copies it to `crazygames/build/`, adds the SDK script tag, leaves out the developer test pages and writes the zip.

## Upload steps

1. Sign in at https://developer.crazygames.com and choose **Submit game**.
2. Upload `swing-or-splash-crazygames.zip` as an HTML5 game.
3. Fill in the form from `STORE_LISTING.md`.
4. Upload the three covers and the two preview videos from `media/`.
5. Open the game in the portal's preview / QA tool and check the list below before you press Submit.

## Check in the CrazyGames QA tool before submitting

The SDK was tested here with a stand-in, because the real CrazyGames servers can't be reached from the build machine. Check these on the real thing:

- The game loads and the loading bar finishes
- The QA tool shows `loadingStart`, `loadingStop`, `gameplayStart` and `gameplayStop` events (gameplayStop when a panel is open or the tab is hidden)
- After the tutorial, a midgame ad is requested after a wave ends, the game pauses and the sound mutes during the ad, and both come back after it
- The rewarded "KEEP THEM" offer appears when a wave takes your creatures, and "x2" appears on the Welcome Back card
- The portal's mute setting silences the game
- Reload the page: your progress is still there
- Try it on a phone: joystick, JUMP button, sound after the first tap, smooth frame rate

## How the SDK is included

- The upload build has `<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>` in `<head>`.
- `src/platform/crazygames.ts` uses the SDK when it is present and runs the game without it when it is missing or blocked (it gives up waiting after 8 seconds).
- Nothing else is loaded from other sites: fonts, art, music and sounds are all inside the build.
