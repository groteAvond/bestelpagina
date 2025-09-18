document.addEventListener("DOMContentLoaded", function() {
    init(); // start alle functions zodra pagina geladen is
});


function init() {
    resetDagkeuze2();
    initDagkeuzeListener();
    initMedeleerlingenInputs();
    initExtraKaartenListener();
    updateTotaalKaarten();
    initHoneypotCheck()

}


function resetDagkeuze2() {
    const dagkeuze2 = document.getElementById("dagkeuze2");
    dagkeuze2.innerHTML = '<option value="" disabled selected>-- Kies een dag --</option>';
    dagkeuze2.disabled = true;
}


function initDagkeuzeListener() { // Dagen en dagkeuzes definiëren in dropdown
    const dagen = ["woensdag", "donderdag", "vrijdag"];
    const dagkeuze1 = document.getElementById("dagkeuze1");
    const dagkeuze2 = document.getElementById("dagkeuze2");

    dagkeuze1.addEventListener("change", () => {
        resetDagkeuze2();
        dagkeuze2.disabled = false;

        const gekozenDag1 = dagkeuze1.value;

        // Tweede dropdown leeg terugzetten en vrijgeven
        dagkeuze2.innerHTML = '<option value="" disabled selected>-- Kies een dag --</option>';
        dagkeuze2.disabled = false;

        // Ongekozen dagen aan tweede dropdown toevoegen
        dagen.forEach(dag => {
            if (dag !== gekozenDag1) {
                const option = document.createElement("option");
                option.value = dag;
                option.textContent = dag.charAt(0).toUpperCase() + dag.slice(1);
                dagkeuze2.appendChild(option);
            }
        });
    });
}


function initMedeleerlingenInputs() { // Dynamisch extra velden creëren voor opgeven medeleerlingen
    const medeleerlingenContainer = document.getElementById("medeleerlingenContainer");

    // Leeg nieuw veld maken
    function nieuwLeegVeld() {
        const inputs = medeleerlingenContainer.querySelectorAll('input[type="number"]');
        const nieuwId = inputs.length + 1;
        const nieuwVeld = document.createElement("input");
        nieuwVeld.type = "number";
        nieuwVeld.name = "medeleerlingen[]";
        nieuwVeld.id = "medeleerling-" + nieuwId;
        nieuwVeld.placeholder = "Leerlingnummer";
        medeleerlingenContainer.appendChild(nieuwVeld);
    }

    // Start altijd met leeg veld als container leeg is
    if (medeleerlingenContainer.children.length === 0) {
        nieuwLeegVeld();
    }

    medeleerlingenContainer.addEventListener("input", function() {
        let inputs = Array.from(medeleerlingenContainer.querySelectorAll('input[type="number"]'));

        // Verwijder lege velden behalve laatste
        for (let i = inputs.length - 2; i >= 0; i--) {
            if (inputs[i].value.trim() === "") {
                inputs[i].remove();
            }
        }

        // Update Id's van resterende velden
        inputs = Array.from(medeleerlingenContainer.querySelectorAll('input[type="number"]'));
        inputs.forEach((input, index) => {
            input.id = "medeleerling-" + (index + 1);
        });

        // Voeg nieuw veld toe alleen bij geen leeg laatste veld
        const laatsteInput = inputs[inputs.length - 1];
        if (laatsteInput && laatsteInput.value.trim() !== "") {
            nieuwLeegVeld();
        }

        // Controle voor minimaal 1 veld
        if (inputs.length === 0) {
            nieuwLeegVeld();
        }

        updateTotaalKaarten();
    });
}


function initExtraKaartenListener() { // Zoeken naar wijzigingen aantal extra kaarten 
    const extraKaartenInput = document.getElementById("extraKaarten");
    extraKaartenInput.addEventListener("input", updateTotaalKaarten);
}


function updateTotaalKaarten() { // Telt aantal ingevulde velden medeleerlingen
    const medeleerlingenInputs = document.querySelectorAll('#medeleerlingenContainer input[type="number"]');
    let aantalMedeleerlingen = Array.from(medeleerlingenInputs)
        .filter(input => input.value.trim() !== "").length

    // Aantal extra kaarten berekenen en updaten
    let extraKaartenInput = document.getElementById("extraKaarten");
    let aantalExtraKaarten = Math.max(0, parseInt(extraKaartenInput.value) || 0 );

    // Totaal aantal kaarten definiëren + tonen
    const totaalKaarten = 1 + aantalMedeleerlingen + aantalExtraKaarten;
    document.getElementById("kaartenAantalTotaal").textContent = totaalKaarten;
}


function initHoneypotCheck() {
    const form = document.getElementById("bestelForm");
    form.addEventListener("submit", function(event) {
        const honeypot = document.getElementById("website").value;
        if(honeypot !== "") {
            event.preventDefault();
            alert("Formulier niet ingediend (spam vermoeden).");
            return false;
        }
    });
}


