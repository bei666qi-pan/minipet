import { FolderOpen, Images, RefreshCw } from "lucide-react";
import { PET_STATES } from "../petStates";
import { getAssetUrlForState, useSettingsStore, type PetState } from "../store/settingsStore";

export function AssetMapper() {
  const { settings, assets, update, scanAssets } = useSettingsStore();

  async function selectDirectory() {
    const directory = await window.minipet.invoke<string | undefined>("dialog:select-directory");
    if (directory) await scanAssets(directory);
  }

  async function setMapping(state: PetState, assetId: string) {
    const current = settings?.assetMapping ?? {};
    await update({ assetMapping: { ...current, [state]: assetId } });
    await scanAssets();
  }

  return (
    <section className="panel-section">
      <div className="section-title">
        <Images size={18} />
        <span>桌宠贴图映射</span>
      </div>
      <div className="toolbar-row">
        <button onClick={() => void selectDirectory()}>
          <FolderOpen size={15} /> 选择素材目录
        </button>
        <button onClick={() => void scanAssets()}>
          <RefreshCw size={15} /> 重新扫描
        </button>
      </div>
      <p className="hint">当前目录：{assets?.directory ?? settings?.assetDirectory}</p>
      {assets?.assets.length ? (
        <div className="asset-map-grid">
          {PET_STATES.map((state) => (
            <label className="field compact" key={state.key}>
              <span>
                {state.label}
                <small>{state.fileName}</small>
              </span>
              <select value={assets.mapping[state.key] ?? ""} onChange={(event) => void setMapping(state.key, event.target.value)}>
                {assets.assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.fileName}
                  </option>
                ))}
              </select>
              {getAssetUrlForState(assets, state.key) ? <img className="asset-thumb" src={getAssetUrlForState(assets, state.key)} alt={state.label} /> : null}
            </label>
          ))}
        </div>
      ) : (
        <p className="hint">没有扫描到图片，MiniPet 会使用 CSS 占位桌宠。</p>
      )}
    </section>
  );
}
