import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import microphone, speaker
from esphome.const import CONF_ID, CONF_MICROPHONE, CONF_SPEAKER

CODEOWNERS = ["@simon"]
DEPENDENCIES = ["microphone", "speaker", "wifi"]
AUTO_LOAD = []

ims_bridge_ns = cg.esphome_ns.namespace("ims_bridge")
ImsBridge = ims_bridge_ns.class_("ImsBridge", cg.Component)

CONF_HOST = "host"
CONF_PORT = "port"

CONFIG_SCHEMA = cv.Schema(
    {
        cv.GenerateID(): cv.declare_id(ImsBridge),
        cv.Required(CONF_MICROPHONE): cv.use_id(microphone.Microphone),
        cv.Required(CONF_SPEAKER): cv.use_id(speaker.Speaker),
        cv.Required(CONF_HOST): cv.string,
        cv.Optional(CONF_PORT, default=3002): cv.port,
    }
).extend(cv.COMPONENT_SCHEMA)


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)

    mic = await cg.get_variable(config[CONF_MICROPHONE])
    cg.add(var.set_microphone(mic))

    spk = await cg.get_variable(config[CONF_SPEAKER])
    cg.add(var.set_speaker(spk))

    cg.add(var.set_host(config[CONF_HOST]))
    cg.add(var.set_port(config[CONF_PORT]))
