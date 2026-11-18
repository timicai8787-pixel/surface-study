# 从 FBX 到网页

原始文件是一枚金属攒件的摄影测量网格，单网格、99,999 个三角面、50,019 个顶点，FBX 里还打着一张贴图 `model_TXTR.tga`（4096 × 4096，24-bit）。导出的环境是 Windows 上的 FBX SDK 2020.3.2。

## 步骤

1. Blender 4.3 导入 FBX。导入后对象带 0.01 的缩放，先应用变换。
2. 贴图从 FBX 的 packed file 取出，缩到 2048 × 2048，存为 JPEG（quality 88）。
3. 对象以攒件本身的包围盒居中，整体按最长边归一化到 1 个单位；扫描底座保留在网格里。
4. 计算底座上表面的位置：`min.z + (max.z - min.z) * 0.355`。网页里的「座 / BED」开关就用这个高度做裁剪面，移除底座时不会重新导出模型。
5. 导出 GLB，Y-up，只保留一个 mesh 和一个材质。结果 3.6 MB。

```bash
blender --background --factory-startup --python scripts/convert_fbx.py -- \
  --input ~/Downloads/model.fbx \
  --out public/models/study-01.glb \
  --texture assets/texture-2048.jpg
```

## 没做的事

- 没有重拓扑，没有补洞，没有修掉断掉的细线。
- 没有把底座从几何里删掉，只做了显示层面的裁剪。
- 没有把贴图烘焙到顶点色，也没有做 LOD；99,999 面在桌面和手机上都可以直接跑。

## 页面

- three.js r180，`MeshPhysicalMaterial`（glTF 里原本是 PBR 材质）。
- 点云模式直接采样原网格的顶点，颜色来自那张 2048 px 贴图，不是另做的效果。
- 光照三档只是改变三盏方向光的颜色、强度和位置；贴图本身已经带有扫描时的光照。
- 构建：Vite，静态输出，GitHub Pages。
