import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { EventEmitter } from 'events'
import LmdbDatabase from '../lmdb'
import {
  ensure3Layout,
  hasLegacyLmdb,
  type AppDataPathOptions,
  type TabDoDataLayout
} from '../appData/appDataPaths'
import { readDataVersion, writeDataVersion } from '../appData/appDataVersion'
import { StorageRouter } from './storageRouter'

const DEFAULT_MAP_SIZE = 2 * 1024 * 1024 * 1024
const DEFAULT_MAX_DBS = 6

export interface StorageInitState {
  firstRun: boolean
  legacyLmdbFound: boolean
  importedFromLegacy: boolean
  layout: TabDoDataLayout
}

export interface StorageManagerOptions extends AppDataPathOptions {
  mapSize?: number
}

export class StorageManager extends EventEmitter {
  private deviceDb: LmdbDatabase | null = null
  private accountDb: LmdbDatabase | null = null
  private router: StorageRouter | null = null
  private initState: StorageInitState | null = null

  constructor(private options: StorageManagerOptions = {}) {
    super()
  }

  /** 初始化唯一的本地数据空间，必要时接管旧版本当前使用的空间。
   * @returns 初始化状态与数据目录。
   * @throws 数据文件无法打开或迁移失败时抛错。
   */
  init(): StorageInitState {
    if (this.initState && this.deviceDb && this.accountDb && this.router) {
      return this.initState
    }

    const existingVersion = readDataVersion(this.options)
    const firstRun = !existingVersion
    const legacyLmdbFound = firstRun && hasLegacyLmdb(this.options)
    const layout = ensure3Layout(this.options)
    const version =
      existingVersion ||
      (legacyLmdbFound ? null : writeDataVersion({ importedFromLegacy: false }, this.options))

    this.deviceDb = this.openDb(layout.deviceLmdbPath)
    // 一次性接管旧版本当前使用的数据，原默认空间另存保留。
    const legacyUid = this.deviceDb.get('SYNC/current-account')?.data?.uid
    const previousPath =
      typeof legacyUid === 'string' ? path.join(layout.accountsRoot, hashAccountId(legacyUid)) : ''
    if (previousPath && fs.existsSync(previousPath)) {
      const retainedDefault = layout.defaultAccountLmdbPath + '.before-local-' + Date.now()
      fs.renameSync(layout.defaultAccountLmdbPath, retainedDefault)
      try {
        fs.renameSync(previousPath, layout.defaultAccountLmdbPath)
      } catch (error) {
        fs.renameSync(retainedDefault, layout.defaultAccountLmdbPath)
        throw error
      }
    }
    this.accountDb = this.openDb(layout.defaultAccountLmdbPath)
    // 账户凭据与同步状态已不再使用，启动时清理旧令牌。
    for (const db of [this.deviceDb, this.accountDb]) {
      for (const prefix of ['AUTH/', 'SYNC/']) for (const doc of db.allDocs(prefix)) db.remove(doc)
    }
    this.router = new StorageRouter(this)
    this.router.bindAccountDb(this.accountDb)

    this.initState = {
      firstRun,
      legacyLmdbFound,
      importedFromLegacy: Boolean(version?.importedFromLegacy),
      layout
    }
    return this.initState
  }

  getInitState(): StorageInitState {
    return this.init()
  }

  getLayout(): TabDoDataLayout {
    return this.init().layout
  }

  getDeviceDb(): LmdbDatabase {
    this.init()
    return this.deviceDb!
  }

  getAccountDb(): LmdbDatabase {
    this.init()
    return this.accountDb!
  }

  getRouter(): StorageRouter {
    this.init()
    return this.router!
  }

  close(): void {
    this.router?.unbind()
    this.router = null
    for (const db of [this.accountDb, this.deviceDb]) {
      try {
        db?.close()
      } catch (error) {
        console.error('[Storage] close db failed:', error)
      }
    }
    this.accountDb = null
    this.deviceDb = null
    this.initState = null
  }

  private openDb(dbPath: string): LmdbDatabase {
    return new LmdbDatabase({
      path: dbPath,
      mapSize: this.options.mapSize || DEFAULT_MAP_SIZE,
      maxDbs: DEFAULT_MAX_DBS
    })
  }
}

export function hashAccountId(uid: string): string {
  return crypto.createHash('sha256').update(uid).digest('hex').slice(0, 16)
}

export const storageManager = new StorageManager()
