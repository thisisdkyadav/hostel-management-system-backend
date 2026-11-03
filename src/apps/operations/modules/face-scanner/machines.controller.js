import { handler } from "../../../../lib/api-kit/index.js"
import {
  getMachineActivity,
  getMachineRoster,
  listMachines,
  pushMachinePerson,
  readMachinePeople,
  removeMachinePerson,
  syncMachineRoster,
  updateMachine,
} from "./machines.service.js"

export const machines = handler(() => listMachines())
export const machineUpdate = handler((req) => updateMachine(req.params.sn, req.body))
export const machineActivity = handler((req) => getMachineActivity(req.params.sn))
export const machineRoster = handler((req) => getMachineRoster(req.params.sn))
export const machineRosterSync = handler((req) => syncMachineRoster(req.params.sn, req.body, req.user))
export const machinePersonPush = handler((req) => pushMachinePerson(req.params.sn, req.body, req.user))
export const machinePersonRemove = handler((req) => removeMachinePerson(req.params.sn, req.params.roll, req.user))
export const machinePeopleRead = handler((req) => readMachinePeople(req.params.sn, req.user))
