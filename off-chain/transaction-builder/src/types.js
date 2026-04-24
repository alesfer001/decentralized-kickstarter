"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CampaignStatus = void 0;
/**
 * Campaign status enum (matches on-chain)
 */
var CampaignStatus;
(function (CampaignStatus) {
    CampaignStatus[CampaignStatus["Active"] = 0] = "Active";
    CampaignStatus[CampaignStatus["Success"] = 1] = "Success";
    CampaignStatus[CampaignStatus["Failed"] = 2] = "Failed";
})(CampaignStatus || (exports.CampaignStatus = CampaignStatus = {}));
