#!/usr/bin/env python3
"""Export an offline SpamSieve corpus snapshot into a private migration bundle."""
import argparse
import base64
import ctypes
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source',required=True,type=Path,help='Directory containing words.sqlite3, messages.sqlite3 and external blob files')
    parser.add_argument('--output',required=True,type=Path)
    args=parser.parse_args()
    source=args.source.resolve();output=args.output.resolve()
    if output.exists():raise RuntimeError('Output must be a new directory')
    output.mkdir(parents=True,mode=0o700)
    words=sqlite3.connect((source/'words.sqlite3').as_uri()+'?mode=ro&immutable=1',uri=True)
    messages=sqlite3.connect((source/'messages.sqlite3').as_uri()+'?mode=ro&immutable=1',uri=True)
    words.row_factory=sqlite3.Row;messages.row_factory=sqlite3.Row
    categories={row['Z_PK']:row['ZNAME'].lower() for row in messages.execute('SELECT Z_PK,ZNAME FROM ZCATEGORY')}
    external={p.name:p for p in (source/'messages-.Messages_SUPPORT').rglob('*') if p.is_file()}
    library=None
    if sys.platform=='darwin':
        library=ctypes.CDLL('/usr/lib/libcompression.dylib')
        library.compression_decode_buffer.restype=ctypes.c_size_t
        library.compression_decode_buffer.argtypes=[ctypes.c_void_p,ctypes.c_size_t,ctypes.c_void_p,ctypes.c_size_t,ctypes.c_void_p,ctypes.c_int]
    totals={'good':0,'spam':0,'words':0,'messages':0,'goodOccurrences':0,'spamOccurrences':0,'bodies':0}
    with (output/'words.jsonl').open('x') as target:
        for row in words.execute('SELECT * FROM ZWORD ORDER BY Z_PK'):
            if row['ZTOTALCOUNT']!=row['ZGOODCOUNT']+row['ZSPAMCOUNT']:raise RuntimeError('Inconsistent source counts')
            target.write(json.dumps({'token':row['ZWORD'],'normalized':row['ZNORMALIZEDWORD'],'good':row['ZGOODCOUNT'],'spam':row['ZSPAMCOUNT'],'probability':row['ZSPAMPROBABILITY'],'lastUsed':row['ZLASTUSEDDATE']},ensure_ascii=False)+'\n')
            totals['words']+=1;totals['goodOccurrences']+=row['ZGOODCOUNT'];totals['spamOccurrences']+=row['ZSPAMCOUNT']
    with (output/'messages.jsonl').open('x') as target:
        for row in messages.execute('SELECT * FROM ZMESSAGE ORDER BY Z_PK'):
            label=categories[row['ZCATEGORY']]
            if label not in ('good','spam'):raise RuntimeError('Unknown training category')
            body=None
            if row['ZMESSAGEDATABLOB'] is not None:
                if library is None:raise RuntimeError('Decoding retained LZFSE message bodies requires macOS')
                blob=messages.execute('SELECT * FROM ZBLOB WHERE Z_PK=?',(row['ZMESSAGEDATABLOB'],)).fetchone()
                value=blob['ZCOMPRESSEDDATA']
                if value[0]==1:packed=value[1:]
                elif value[0]==2:packed=external[value[1:].rstrip(b'\x00').decode('ascii')].read_bytes()
                else:raise RuntimeError('Unknown blob storage marker')
                if blob['ZSIZE']>64*1024*1024:raise RuntimeError('Message exceeds migration size bound')
                destination=ctypes.create_string_buffer(blob['ZSIZE'])
                source_buffer=ctypes.create_string_buffer(packed)
                size=library.compression_decode_buffer(destination,blob['ZSIZE'],source_buffer,len(packed),None,0x801)
                if size!=blob['ZSIZE']:raise RuntimeError('Message body decoding failed')
                body=base64.b64encode(destination.raw[:size]).decode('ascii');totals['bodies']+=1
            data={key:({'base64':base64.b64encode(value).decode('ascii')} if isinstance(value,bytes) else value) for key,value in dict(row).items()}
            target.write(json.dumps({'sourceId':row['Z_PK'],'label':label,'sourceData':data,'rawMessage':body},ensure_ascii=False)+'\n')
            totals[label]+=1;totals['messages']+=1
    files={name:hashlib.sha256((output/name).read_bytes()).hexdigest() for name in ('words.jsonl','messages.jsonl')}
    manifest={'version':1,'totals':totals,'files':files,'sourceDigests':{name:hashlib.sha256((source/name).read_bytes()).hexdigest() for name in ('words.sqlite3','messages.sqlite3')}}
    (output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    for path in output.iterdir():os.chmod(path,0o600)
    print(json.dumps(totals))

if __name__=='__main__':main()
