/**
 * WARNING: This file should ONLY be accessed through lvmProvider.
 * Do not import or use this class directly in other parts of the application.
 * Use ContentProviderRegistry or lvmProvider instead.
 */

import path from "path"
import { ToMain } from "../../../types/IPC/ToMain"
import type { TrimmedShows } from "../../../types/Show"
import { sendToMain } from "../../IPC/main"
import { getDataFolderPath, parseShow, readFile } from "../../utils/files"
import { lvmConnect } from "./lvmConnect"
import type { lvmSongData } from "./types"

/**
 * Data structure for LVM Service startup load
 */
export interface lvmStartupLoadData {
    shows: TrimmedShows
    categories: string[]
}

/**
 * Handles exporting LVM Presenter songs to LVM Service.
 * Syncs local songs with LVM Service by identifying missing songs and sending them in batches.
 */
export class lvmExport {
    public static async sendSongsToLvm(data: lvmStartupLoadData): Promise<void> {
        const missingIds = await this.getMissingSongIds(data)
        // console.log("Sending songs to LVM Service", missingIds.length)
        if (missingIds.length === 0) return

        // Get song data only for missing songs
        const songData = this.getLvmSongData(missingIds, data)
        const batchSize = 10

        // Send the missing songs in batches
        for (let i = 0; i < songData.length; i += batchSize) {
            const batch = songData.slice(i, i + batchSize)
            await lvmConnect.apiRequest({
                api: "content",
                authenticated: true,
                scope: "plans",
                endpoint: "/songs/import",
                method: "POST",
                data: batch
            })
        }

        sendToMain(ToMain.TOAST, `Synced ${missingIds.length} new songs to LVM Service`)
    }

    private static async getMissingSongIds(data: lvmStartupLoadData): Promise<string[]> {
        const lvmPresenterIds = this.getAllLVMPresenterSongIds(data)

        const missingSongsResponse = await lvmConnect.apiRequest({
            api: "content",
            authenticated: true,
            scope: "plans",
            endpoint: "/arrangements/lvmPresenter/missing",
            method: "POST",
            data: { lvmPresenterIds }
        })

        return missingSongsResponse || []
    }

    private static getAllLVMPresenterSongIds(data: lvmStartupLoadData): string[] {
        const shows = data.shows
        const selectedCategories = data.categories || ["song"]
        return Object.keys(shows).filter((key) => selectedCategories.includes(shows[key].category || ""))
    }

    private static getLvmSongData(lvmPresenterIds: string[], data: lvmStartupLoadData): lvmSongData[] {
        const songList: lvmSongData[] = []
        const shows = data.shows

        lvmPresenterIds.forEach((key: string) => {
            const show = shows[key]
            const showData = this.loadShowData(show.name)
            if (!showData?.[1]?.slides) return

            const songData: lvmSongData = {
                lvmPresenterId: key,
                title: showData[1].meta?.title || showData[1].name || "",
                artist: showData[1].meta?.artist || "",
                lyrics: "",
                ccliNumber: showData[1].meta?.CCLI || ""
            }

            // Add lyrics with group names
            let currentGroup = ""
            Object.keys(showData[1].slides).forEach((slideKey: string) => {
                const slide = showData[1].slides[slideKey]
                // Add group name if it's different from the current group
                if (slide.group && slide.group !== currentGroup) {
                    songData.lyrics += `[${slide.group}]\n`
                    currentGroup = slide.group
                }
                slide.items.forEach((item) => {
                    item.lines?.forEach((line) => {
                        songData.lyrics += line.text?.[0]?.value + "\n" || ""
                    })
                })
                songData.lyrics += "\n"
            })
            songData.lyrics = songData.lyrics.replaceAll("\n\n", "\n")

            songList.push(songData)
        })

        return songList
    }

    private static loadShowData(showName: string) {
        const showsPath = getDataFolderPath("shows")
        const showPath = path.join(showsPath, `${showName}.show`)
        const jsonData = readFile(showPath) || "{}"
        return parseShow(jsonData)
    }
}
