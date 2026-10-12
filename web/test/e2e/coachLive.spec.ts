// The guide overlay on Live's keys, as Android's (PatternLine.kt, LiveFunctionKeys.kt): RECORD
// and STEP on the display line get signal tags, SOUND says what EDIT does, PROJECT and TEMPO say
// what a hold does; none hides another. And PROJECT held, a KEYS key where a pad prints 1 to 9
// picks that project, sounding nothing (Kotlin keysKey, padDigit).
import type { Locator } from '@playwright/test'
import { coachHides, expect, test } from './fixtures'

const SIZES = [
  ['on the desk', 1280, 800],
  ['on a phone', 412, 915],
] as const

for (const [name, width, height] of SIZES) {
  test.describe(name, () => {
    test.use({ viewport: { width, height }, hasTouch: true })

    test("the line's keys and the function keys are tagged", async ({ page }) => {
      await page.goto('/?demo')
      await expect(page.locator('.live-strip')).toContainText('Project 1')
      await page.getByRole('banner').getByRole('button', { name: "What's what" }).click()
      const coach = page.getByRole('dialog', { name: "What's what" })
      for (const [id, text] of [
        ['live.record', 'RECORD A PATTERN: TAP, THEN PLAY; HOLD FOR ITS SETTINGS'],
        ['live.step', 'STEP THROUGH THE PATTERN'],
        ['live.sound', "CHANGE A PAD'S SOUND"],
        ['live.project', 'NEXT PROJECT: TAP; HOLD + PAD 1–9 TO PICK'],
        ['live.tempo', 'CLICK: TAP; HOLD FOR TEMPO'],
      ] as const) {
        await expect(coach.locator(`[data-coach-tag="${id}"]`), id).toHaveText(text)
      }
      expect(await coachHides(page)).toEqual([])
    })

    test('PROJECT held, a KEYS key printed 3 picks project 3 and sounds nothing', async ({ page }) => {
      await page.goto('/?demo')
      await expect(page.locator('.live-strip')).toContainText('Project 1')
      await page.locator('[data-pad="9"]').click()
      await page.getByRole('button', { name: 'Pads. Tap for keys.' }).click()
      // Where there is room for the piano, the grid instead (a portrait phone has the grid alone).
      const grid = page.getByRole('radiogroup', { name: 'Keys view' }).getByRole('radio', { name: 'Keys on the pads' })
      if (await grid.isVisible()) await grid.click()
      const key = page.locator('.live-kgrid [data-key="5"]')
      await expect(key).toBeVisible()
      const center = async (l: Locator): Promise<{ x: number; y: number }> => {
        const b = (await l.boundingBox())!
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
      }
      const projectKey = page.getByRole('button', { name: 'Project' })
      // KEYS' line shows the sound, not the project: PROJECT's own label says it.
      await expect(projectKey.locator('.fn-key__label')).toHaveText('P1')
      const project = await center(projectKey)
      const three = await center(key)
      const cdp = await page.context().newCDPSession(page)
      const touch = (type: 'touchStart' | 'touchEnd', points: { x: number; y: number }[]) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ ...p, id })) })
      await touch('touchStart', [project])
      await touch('touchStart', [project, three])
      // Taken by PROJECT: the key doesn't sound.
      await expect(key).not.toHaveClass(/is-playing/)
      await touch('touchEnd', [project])
      await touch('touchEnd', [])
      await expect(projectKey.locator('.fn-key__label')).toHaveText('P3')
      // Neither stepped on nor the project sheet: the pick is all it did.
      await expect(page.getByRole('dialog')).toHaveCount(0)
    })
  })
}
