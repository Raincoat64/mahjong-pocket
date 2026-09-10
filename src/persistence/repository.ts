export interface MatchSaveRepository {
  load(): Promise<string | null>;
  save(serialized: string): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryMatchSaveRepository implements MatchSaveRepository {
  value: string | null = null;
  async load(): Promise<string | null> { return this.value; }
  async save(serialized: string): Promise<void> { this.value = serialized; }
  async clear(): Promise<void> { this.value = null; }
}

/** Browser repository. No browser global is touched until a method is invoked. */
export class IndexedDbMatchSaveRepository implements MatchSaveRepository {
  private loaded = false;
  private expected: string | null = null;
  constructor(
    private readonly dbName = "mahjong-pocket",
    private readonly storeName = "save",
    private readonly key = "current-match"
  ) {}

  private open(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") return Promise.reject(new Error("INDEXEDDB_UNAVAILABLE"));
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      let blocked=false;
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.storeName)) db.createObjectStore(this.storeName);
      };
      req.onblocked = () => {blocked=true;reject(new Error('INDEXEDDB_OPEN_BLOCKED'));};
      req.onsuccess = () => { if(blocked){req.result.close();return;} req.result.onversionchange=()=>req.result.close(); resolve(req.result); };
      req.onerror = () => reject(req.error ?? new Error("INDEXEDDB_OPEN_FAILED"));
    });
  }

  async load(): Promise<string | null> {
    const db = await this.open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readonly");
        const req = tx.objectStore(this.storeName).get(this.key);
        let value: string | null = null;
        let valid = true;
        req.onsuccess = () => {
          if(req.result !== undefined && typeof req.result !== 'string'){valid=false;this.loaded=false;reject(new Error('CORRUPT_SESSION_DATA'));return;}
          value=req.result ?? null;
        };
        tx.oncomplete=()=>{if(valid){this.expected=value;this.loaded=true;resolve(value);}};
        tx.onabort=()=>reject(tx.error??new Error('INDEXEDDB_READ_ABORTED'));
        req.onerror = () => reject(req.error ?? new Error("INDEXEDDB_READ_FAILED"));
      });
    } finally { db.close(); }
  }

  async save(serialized: string): Promise<void> {
    await this.write(serialized);
  }

  /** Compare and write in one transaction, so an older tab cannot replace a newer save. */
  private async write(serialized: string | null): Promise<void> {
    if(!this.loaded)await this.load();
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readwrite");
        const store=tx.objectStore(this.storeName),request=store.get(this.key);
        let failure: unknown;
        request.onsuccess=()=>{
          if((request.result??null)!==this.expected){failure=new Error('SAVE_CONFLICT');tx.abort();return;}
          try{
            if(serialized===null)store.delete(this.key);
            else store.put(serialized,this.key);
          }catch(error){failure=error;tx.abort();}
        };
        tx.oncomplete = () => {this.expected=serialized;resolve();};
        tx.onerror = () => reject(failure ?? tx.error ?? new Error("INDEXEDDB_WRITE_FAILED"));
        tx.onabort = () => reject(failure ?? tx.error ?? new Error("INDEXEDDB_WRITE_ABORTED"));
      });
    } finally { db.close(); }
  }

  async clear(): Promise<void> {
    await this.write(null);
  }

  /** Explicit recovery action: keep the original record in the same atomic transaction. */
  async archiveAndClear(): Promise<void> {
    const db=await this.open();
    try {
      await new Promise<void>((resolve,reject)=>{
        const tx=db.transaction(this.storeName,'readwrite'),store=tx.objectStore(this.storeName);
        const request=store.get(this.key);
        let failure: unknown;
        request.onsuccess=()=>{
          const current=request.result??null;
          // A malformed non-string record may be explicitly archived, but a newly
          // valid save created by another window must never be cleared in its place.
          if((this.loaded&&current!==this.expected)||(!this.loaded&&typeof current==='string')){failure=new Error('SAVE_CONFLICT');tx.abort();return;}
          try{
            if(request.result!==undefined)store.put(request.result,`${this.key}-recovery-${Date.now()}`);
            store.delete(this.key);
          }catch(error){failure=error;tx.abort();}
        };
        tx.oncomplete=()=>{this.expected=null;this.loaded=true;resolve();};
        tx.onerror=()=>reject(failure??tx.error??new Error('INDEXEDDB_RECOVERY_FAILED'));
        tx.onabort=()=>reject(failure??tx.error??new Error('INDEXEDDB_RECOVERY_ABORTED'));
      });
    }finally{db.close();}
  }
}

/**
 * Serializes async writes. This prevents an older slower IndexedDB write from
 * completing after a newer state and accidentally becoming the persisted state.
 */
export class SerialSaveQueue {
  private tail: Promise<void> = Promise.resolve();
  constructor(private readonly repository: MatchSaveRepository) {}

  enqueue(serialized: string): Promise<void> {
    const run = this.tail.then(() => this.repository.save(serialized));
    // A failed write is reported to this caller but must not poison every future save.
    this.tail = run.catch(() => undefined);
    return run;
  }

  flush(): Promise<void> { return this.tail; }
}
