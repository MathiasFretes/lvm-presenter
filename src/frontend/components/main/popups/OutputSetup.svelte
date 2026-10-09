<script lang="ts">
    import { popupData } from "../../../stores"
    import { translateText } from "../../../utils/language"
    import MaterialButton from "../../inputs/MaterialButton.svelte"
    import MaterialMultiChoice from "../../inputs/MaterialMultiChoice.svelte"
    import Link from "../../inputs/Link.svelte"
    import { registerPopupSubmit } from "../../../utils/popup"

    registerPopupSubmit(confirm)

    const localTypes = [
        { id: "window", name: translateText("settings.window"), icon: "hdmi", tip: "HDMI, DisplayPort" },
    ]

    const networkTypes = [
        { id: "lvmNdi", name: "LVM NDI", icon: "ndi", tip: "Video NDI en la red local" },
        { id: "omt", name: "OMT", icon: "omt", tip: "IP" },
        { id: "webrtc", name: "WebRTC", icon: "broadcast", tip: "WHIP, restream.io" },
        { id: "rtmp", name: "RTMP", icon: "broadcast", tip: "YouTube, Twitch, Facebook Live" }
    ]

    let localType: string = ""
    let networkType: string = ""

    function confirm() {
        if (!localType && !networkType) return

        popupData.set({ id: "choose_output_type", value: { localType, networkType } })
    }
</script>

<div class="types">
    <div class="section">
        <p class="title">{translateText("settings.local_output")}</p>
        <MaterialMultiChoice options={localTypes} value={localType} on:click={(e) => (localType = e.detail)} highlightFirst={false} canDeselect />
    </div>

    <div class="section">
        <p class="title">{translateText("settings.network_output")}</p>
        <MaterialMultiChoice options={networkTypes} value={networkType} on:click={(e) => (networkType = e.detail)} highlightFirst={false} canDeselect />
        <p class="ndi-info">NDI®: <Link url="https://ndi.video/">información y herramientas oficiales</Link></p>
    </div>
</div>

<MaterialButton variant="contained" disabled={!localType && !networkType} style="margin-top: 20px;width: 100%;" on:click={confirm}>
    {translateText("popup.confirm")}
</MaterialButton>

<style>
    .types {
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .section {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .title {
        opacity: 0.7;
        font-size: 0.9em;
    }
    .ndi-info { font-size: 0.8em; opacity: 0.8; }
</style>
