#!/usr/bin/env node
/**
 * build-and-hash.js
 *
 * 1) Runs the widget build if a build script exists (optional).
 * 2) Finds build output (dist | build | public | existing concierge-dist).
 * 3) Copies .js and .css files to ../../concierge-dist with content-hash in filename.
 * 4) Writes manifest.json and concierge-loader.js into concierge-dist.
 *
 * Usage: run this from concierge/widget (CI workflow does this).
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execSync } = require('child_process')

function hash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 8)
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

async function main() {
  const cwd = process.cwd() // expects to be run in concierge/widget
  const repoRoot = path.resolve(cwd, '..', '..')
  const possibleSrc = ['dist', 'build', 'public', '../concierge-dist']
  let srcDir = null

  // Try to run a build if package.json has a "build" script
  try {
    const pkgPath = path.join(cwd, 'package.json')
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      if (pkg.scripts && pkg.scripts.build) {
        console.log('Running npm run build...')
        execSync('npm run build', { stdio: 'inherit' })
      } else if (fs.existsSync(path.join(cwd, 'build.js'))) {
        console.log('Running node build.js...')
        try { execSync('node build.js', { stdio: 'inherit' }) } catch (e) { /* ignore */ }
      } else {
        console.log('No build script detected; assuming pre-built files exist.')
      }
    }
  } catch (e) {
    console.warn('Build step failed or skipped:', e.message)
  }

  // Find source dir
  for (const cand of possibleSrc) {
    const test = path.resolve(cwd, cand)
    if (fs.existsSync(test) && fs.statSync(test).isDirectory()) {
      srcDir = test
      break
    }
  }

  if (!srcDir) {
    // fallback to concierge-dist in repo root
    const fallback = path.resolve(repoRoot, 'concierge-dist')
    if (fs.existsSync(fallback)) srcDir = fallback
  }

  if (!srcDir) {
    console.error('No build output directory found. Expected one of: dist, build, public, or concierge-dist.')
    process.exit(1)
  }

  console.log('Using source directory:', srcDir)

  const outDir = path.resolve(repoRoot, 'concierge-dist')
  // Clean / recreate outDir
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true })
  }
  ensureDir(outDir)

  // Recursively copy files and hash .js/.css files
  const manifest = {
    js: null,
    css: []
  }

  function walk(relDir = '') {
    const dir = path.join(srcDir, relDir)
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const ent of entries) {
      const relPath = path.posix.join(relDir, ent.name)
      const absPath = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        walk(relPath)
      } else {
        const ext = path.extname(ent.name).toLowerCase()
        const buf = fs.readFileSync(absPath)
        if (ext === '.js' || ext === '.css') {
          const h = hash(buf)
          const base = path.basename(ent.name, ext)
          const hashedName = `${base}.${h}${ext}`
          const targetRel = path.posix.join(relDir, hashedName)
          const targetAbs = path.join(outDir, targetRel)
          ensureDir(path.dirname(targetAbs))
          fs.writeFileSync(targetAbs, buf)
          console.log(`Wrote ${targetRel}`)

          // add to manifest (pick concierge-widget.*.js as main js if possible)
          if (ext === '.js') {
            // prefer concierge-widget.*.js as main js
            if (!manifest.js || base.includes('concierge-widget')) {
              manifest.js = targetRel
            }
          } else if (ext === '.css') {
            manifest.css.push(targetRel)
          }
        } else {
          // copy other static files (images, html, etc.) preserving path
          const targetAbs = path.join(outDir, relPath)
          ensureDir(path.dirname(targetAbs))
          fs.copyFileSync(absPath, targetAbs)
        }
      }
    }
  }

  walk('')

  if (!manifest.js) {
    // try to find any js in outDir and pick first
    const all = []
    function pick(dir) {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name)
        if (f.isDirectory()) pick(p)
        else if (p.endsWith('.js')) all.push(path.relative(outDir, p).split(path.sep).join(path.posix.sep))
      }
    }
    pick(outDir)
    if (all.length > 0) manifest.js = all[0]
  }

  // Ensure arrays are unique
  manifest.css = Array.from(new Set(manifest.css))

  console.log('Manifest will be:', manifest)

  // Write manifest.json at outDir root
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  console.log('Wrote manifest.json')

  // Write loader script (concierge-loader.js) to outDir root
  const loader = `/*
  Concierge loader (auto-generated).
  Fetches manifest.json (no-cache) and injects CSS then JS into the page.
  This file should be short-cached (low TTL).
*/
(function () {
  async function load() {
    try {
      var res = await fetch('/manifest.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('manifest fetch failed: ' + res.status);
      var manifest = await res.json();

      // inject CSS
      if (Array.isArray(manifest.css)) {
        manifest.css.forEach(function (cssPath) {
          try {
            var l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = '/' + cssPath.replace(/^[\\/]+/, '');
            l.crossOrigin = 'anonymous';
            document.head.appendChild(l);
          } catch (e) { console.error('Failed to inject css', e); }
        });
      }

      // inject JS
      if (manifest.js) {
        var s = document.createElement('script');
        s.src = '/' + manifest.js.replace(/^[\\/]+/, '');
        s.async = true;
        s.crossOrigin = 'anonymous';
        document.body.appendChild(s);
      }
    } catch (err) {
      console.error('Concierge loader error:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();`

  fs.writeFileSync(path.join(outDir, 'concierge-loader.js'), loader, 'utf8')
  console.log('Wrote concierge-loader.js')

  console.log('Build-and-hash completed. concierge-dist created at:', outDir)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
