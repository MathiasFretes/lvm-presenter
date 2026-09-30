{
  "variables": { "ndi_sdk_dir%": "" },
  "targets": [{
    "target_name": "lvm_ndi",
    "sources": ["native/addon.cpp"],
    "include_dirs": ["<(ndi_sdk_dir)/Include"],
    "defines": ["NAPI_VERSION=8"],
    "conditions": [["OS=='win'", { "libraries": ["kernel32.lib"] }]]
  }]
}
