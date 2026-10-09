// Remote ownership checks need argument boundaries, not ps's unquoted display.
// Darwin has no /proc; KERN_PROCARGS2 supplies argc + NUL-delimited argv.
export const REMOTE_PROCESS_ARGS_PY = String.raw`
def process_args(pid):
 if sys.platform == "darwin":
  import ctypes,struct
  libc=ctypes.CDLL(None,use_errno=True)
  mib=(ctypes.c_int*3)(1,49,pid)
  size=ctypes.c_size_t()
  if libc.sysctl(mib,3,None,ctypes.byref(size),None,0)!=0:
   raise OSError(ctypes.get_errno(),"process argv unavailable")
  buf=ctypes.create_string_buffer(size.value)
  if libc.sysctl(mib,3,buf,ctypes.byref(size),None,0)!=0:
   raise OSError(ctypes.get_errno(),"process argv unavailable")
  raw=buf.raw[:size.value]
  if len(raw)<4: raise OSError("truncated process argv")
  argc=struct.unpack_from("=i",raw)[0]
  if argc<1: raise OSError("empty process argv")
  pos=raw.find(b"\0",4)
  if pos<0: raise OSError("missing executable delimiter")
  pos+=1
  while pos<len(raw) and raw[pos]==0: pos+=1
  values=raw[pos:].split(b"\0",argc)
  if len(values)<=argc: raise OSError("truncated argument vector")
  return [v.decode("utf-8","surrogateescape") for v in values[:argc]]
 raw=open(f"/proc/{pid}/cmdline","rb").read()
 return [v.decode("utf-8","surrogateescape") for v in raw.removesuffix(b"\0").split(b"\0")]
`
