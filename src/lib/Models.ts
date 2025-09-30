enum ListenModel {
    General = "nova-3-general",
    Medical = "nova-3-medical",
}

enum ThinkModel {
    Claude = "claude-3-5-haiku-latest",
    GPT = "gpt-4o",
    Google = "gemini-2.5-flash",
}

enum SpeechModel {
    Thalia = "aura-2-thalia-en",
    Andromeda = "aura-2-andromeda-en",
    Helena = "aura-2-helena-en",
    Apollo = "aura-2-apollo-en",
    Arcas = "aura-2-arcas-en",
    Aries = "aura-2-aries-en",
}

export { ListenModel, ThinkModel, SpeechModel };