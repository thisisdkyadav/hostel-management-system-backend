import { handler } from "../../../../lib/api-kit/index.js"
import { getMachineActivity, importFaces, listMachines, updateMachine } from "./machines.service.js"

export const machines = handler(() => listMachines())
export const machineUpdate = handler((req) => updateMachine(req.params.sn, req.body))
export const machineActivity = handler((req) => getMachineActivity(req.params.sn))
export const faceImport = handler(() => importFaces())
