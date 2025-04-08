
import { cmd } from "../../common/cmdClient";
import { cfg_all } from "../../common/configUtil";
import { network } from "../../common/network";
import { UIMgr } from "../../common/uiMgr";
import { Entity_type } from "../entity";
import { Dic, MapMain } from "../mapMain";
import { I_xy, Player } from "../player";
import { Role } from "../role";
import { E_skillTargetType, SkillPre } from "./skillPre";

/** 技能实现集合 */
let skillConDic: Dic<typeof SkillBase> = {};

/**
 * 技能注册
 */
export function registerSkill(skillCon: typeof SkillBase, skillId: number) {
    // console.log("注册技能", skillCon, skillCon.name, "|", skillId)
    skillConDic[skillId] = skillCon;
}

/** 技能管理 */
export class SkillMgr {
    public role: Role;  // 对应角色
    private skillDic: Dic<SkillBase> = {};
    constructor(role: Role) {
        this.role = role;
    }


    /** 添加技能 */
    addSkill(skillId: number) {
        if (this.skillDic[skillId]) {
            return null;
        }
        let skillCon = skillConDic[skillId];
        if (skillCon) {
            this.skillDic[skillId] = new skillCon(this, 0);
        } else {
            console.warn("没有技能实现", skillId)
        }
        return this.skillDic[skillId];
    }

    /** 删除技能 */
    delSkill(skillId: number) {
        let skill = this.skillDic[skillId];
        if (skill) {
            delete this.skillDic[skillId];
            skill.skillOver();
        }
    }

    /** 使用技能 */
    useSkill(msg: I_onUseSkill) {
        let skill = this.getSkill(msg.skillId);
        if (!skill) {
            skill = this.addSkill(msg.skillId);
        }
        if (skill) {
            skill.useSkill(msg);
        }
    }
    /** 技能过程 */
    skillAffect(msg: { "id": number, "skillId": number, [key: string]: any }) {
        let skill = this.getSkill(msg.skillId);
        if (skill) {
            skill.skillAffect(msg);
        }
    }
    /** 技能结束 */
    skillOver(msg: { "id": number, "skillId": number }) {
        let skill = this.getSkill(msg.skillId);
        if (skill) {
            skill.skillOver();
        }
    }

    getSkill(skillId) {
        return this.skillDic[skillId];
    }

    /** 告诉服务器要使用技能 */
    tellSvrUseSkill(msg: { "skillId": number, "id"?: number, "x"?: number, "y"?: number }) {
        network.sendMsg(cmd.map_main_useSkill, msg);
    }


    /** 点击技能（想要使用该技能） */
    btnSkill(skillId) {
        let skill = this.getSkill(skillId);
        if (!skill) {
            console.log("没有该技能", skillId)
            return;
        }
        skill.btnSkill();
    }


}


/** 技能基类 */
export class SkillBase {
    skillId: number;    // 技能id
    skillMgr: SkillMgr;
    cdBase: number = 0;
    cd: number = 0; // 剩余时间

    constructor(skillMgr: SkillMgr, skillId: number) {
        this.skillMgr = skillMgr;
        this.skillId = skillId;
        this.cdBase = cfg_all().skill[this.skillId].cd;
    }

    /** 使用技能 */
    useSkill(info: I_onUseSkill) {
    }
    /** 技能过程 */
    skillAffect(msg: any) {
    }
    /** 技能结束 */
    skillOver() {
    }


    /** 点击技能（想要使用该技能） */
    btnSkill() {
        if (this.cd > 0) {
            UIMgr.showTileInfo("技能cd中");
            return;
        }
        let cfg = cfg_all().skill[this.skillId];
        if (this.skillMgr.role.mp < cfg.mpCost) {
            UIMgr.showTileInfo("魔法不足");
            return;
        }
        if (!this.skillMgr.role.buffMgr.canUseSkill()) {
            UIMgr.showTileInfo("晕眩中");
            return;
        }


        if (cfg.targetType === E_skillTargetType.noTarget) {
            this.skillMgr.tellSvrUseSkill({ "skillId": this.skillId });
        } else {
            SkillPre.instance.setTarget({ "targetType": cfg.targetType, "cb": this.targetSelected, "self": this });
        }
    }

    /** 指向性技能，选择目标回调 */
    private targetSelected(param: { "id": number, "pos": cc.Vec2 }) {
        let cfg = cfg_all().skill[this.skillId];
        if (cfg.targetType === E_skillTargetType.floor) {
            if (cc.Vec2.distance<I_xy>(this.skillMgr.role.node, param.pos) > cfg.targetDistance) {
                UIMgr.showTileInfo("超过施法距离");
            } else {
                this.skillMgr.tellSvrUseSkill({ "skillId": this.skillId, "x": Math.floor(param.pos.x), "y": Math.floor(param.pos.y) });
            }
            return;
        }

        if (!param.id) {
            return UIMgr.showTileInfo("需要以某个单位为目标");;
        }
        let meP = this.skillMgr.role as Player;
        let otherP = MapMain.instance.getEntity<Player>(param.id);
        if (!otherP) {
            return;
        }
        if (otherP.isDie()) {
            return UIMgr.showTileInfo("目标已死亡");
        }
        if (otherP.t === Entity_type.item) {    // 道具
            return;
        } else if (otherP.t === Entity_type.monster) {  // 野怪
            if (cfg.targetType === E_skillTargetType.notEnemy) {
                return UIMgr.showTileInfo("不能以野怪为目标");
            }
        } else {    // 玩家
            if (cfg.targetType === E_skillTargetType.enemy) {
                if (meP === otherP) {
                    return UIMgr.showTileInfo("不能以自己为目标");
                }
            } else {
                if (meP !== otherP) {
                    return UIMgr.showTileInfo("必须以友方为目标");
                }
            }
        }
        if (cc.Vec2.distance<I_xy>(this.skillMgr.role.node, otherP.node) > cfg.targetDistance) {
            return UIMgr.showTileInfo("超过施法距离");
        }

        this.skillMgr.tellSvrUseSkill({ "skillId": this.skillId, "id": param.id });
    }
}

/** 通知使用技能 */
export interface I_onUseSkill {
    "id": number,
    "skillId": number,
    "id2": number,
    "x": number,
    "y": number,
    "data": I_skillDataOne[],
}

export interface I_skillDataOne {
    id: number,
    hurt: number,
    hp: number,
}