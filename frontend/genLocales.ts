import * as fs from 'node:fs'
import * as path from 'node:path'
import csv from 'csvtojson'

// Путь, куда сохраняются json с локализацией
const L10N_PATH = path.resolve(__dirname, './i18n/locales')

// Документ для парсинга локализации:
// https://docs.google.com/spreadsheets/d/1OUjXYpa2RNoUoc2GTo8hiLSX6xZuIrNch4Znk04IIH8/edit?gid=0
const SHEET_ID = '1OUjXYpa2RNoUoc2GTo8hiLSX6xZuIrNch4Znk04IIH8'
const SHEET_GID = '0'

type L10nData = Record<string, any>
type L10nKeys = Record<string, L10nData>

async function downloadCsvFile(sheetId: string, gid: string) {
  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
  console.log(`Download sheet: ${exportUrl}`)
  const response = await fetch(exportUrl)
  return await response.text()
}

async function parseCsv(csvText: string) {
  const rows = await csv({ noheader: true, output: 'csv' }).fromString(csvText)
  return rows
}

function parseL10n(rows: any[]): L10nKeys {
  const headers = rows[0]
  const keys: L10nKeys = {}

  function setNestedValue(target: Record<string, any>, path: string[], value: string) {
    let current: Record<string, any> = target
    for (let i = 0; i < path.length; i++) {
      const segment = path[i]
      if (segment == null || segment === '') {
        continue
      }
      const isLast = i === path.length - 1
      if (isLast) {
        current[segment] = value
        return
      }
      if (current[segment] == null || typeof current[segment] !== 'object' || Array.isArray(current[segment])) {
        current[segment] = {}
      }
      current = current[segment] as Record<string, any>
    }
  }

  for (let i = 2; i < headers.length; i++) {
    const filename = headers[i]
    if (!filename) {
      continue
    }
    keys[filename] = {}
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const key = row[0]
    // Пропускаем пустые строки
    if (!key) continue

    for (let j = 2; j < row.length; j++) {
      const value = row[j]
      // Пропускаем пустые значения
      if (value) {
        const filename = headers[j]
        if (!filename) {
          continue
        }
        let container = keys[filename]
        if (container == null) {
          container = {}
          keys[filename] = container
        }
        if (key.includes('.')) {
          setNestedValue(container, key.split('.'), value)
        } else {
          container[key] = value
        }
      }
    }
  }

  return keys
}

async function saveL10nFiles(l10nFiles: L10nKeys) {
  if (!fs.existsSync(L10N_PATH)) {
    throw new Error(`Localization path not found: ${L10N_PATH}`)
  }
  console.log(`Set localization path: ${L10N_PATH}`)

  for (const [filename, data] of Object.entries(l10nFiles)) {
    const filePath = path.join(L10N_PATH, `${filename}.json`)
    const jsonData = JSON.stringify(data, null, 2)
    fs.writeFileSync(filePath, jsonData + '\n', 'utf-8')
    console.log(`✅ Saved localization file: "${filename}.json"`)
  }
}

async function main() {
  const csvText = await downloadCsvFile(SHEET_ID, SHEET_GID)
  const rows = await parseCsv(csvText)
  const l10nFiles = parseL10n(rows)
  await saveL10nFiles(l10nFiles)
}

main().catch(error => {
  console.error('Unexpected error:', error.message)
  process.exit(1)
})
