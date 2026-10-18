<script>
  import { fade } from "svelte/transition";
  let visible = true;
  let active = false;
  function typewriter(node, { speed = 5 }) {
    const valid =
      node.childNodes.length === 1 &&
      node.childNodes[0].nodeType === Node.TEXT_NODE;

    if (!valid) {
      throw new Error(
        `This transition only works on elements with a single text node child`
      );
    }

    const text = node.textContent;
    const duration = text.length / (speed * 0.01);

    return {
      duration,
      tick: (t) => {
        const i = ~~(text.length * t);
        node.textContent = text.slice(0, i);
      },
    };
  }

  window.addEventListener("load", function () {
    // Get the container element
    var spinebtnContainer = document.getElementById("spine-controller");

    // Get all buttons with class="btn" inside the container
    var btnSpine = spinebtnContainer.getElementsByClassName("spine-unit");

    // Loop through the buttons and add the active class to the current/clicked button
    for (var i = 0; i < btnSpine.length; i++) {
      btnSpine[i].addEventListener("mouseover", function () {
        var current = document.getElementsByClassName(" active");
        current[0].className = current[0].className.replace(" active", "");
        this.className += " active";
      });
    }
  });
  /**
   *
   *
  var slideIndex = 0;



  export function showSlides() {
    var i;
    //console.log('area element id = ' + id);

    var imageNumber = this.getAttribute("data-image-number");
    //alert("The " + ele.innerHTML + " is a " + imageNumber + ".");
    var slides = document.getElementsByClassName("mySlides");
    var dots = document.getElementsByClassName("dot");
    slides[imageNumber - 1].style.display = "none";

    for (i = 0; i < slides.length; i++) {
      slides[i].style.display = "none";
    }

    slides[imageNumber - 1].style.display = "block";


  }
   */
  const cases = [
    {
      no: "1",
      id: "ember",
      name: "Ember Design Language System",
      image: "/images/STEALTH.png",
    },
    {
      no: "2",
      id: "stepup",
      name: "StepUp",
      image: "https://proj-ash.vercel.app/images/DARK FUTURE.png",
    },
    {
      no: "3",
      id: "lynn",
      name: "lynn",
      image: "https://proj-ash.vercel.app/images/LYNN.png",
    },
  ];

  let selectedCaseStudy = 0;
</script>

<section>
  {#if active}
    <div class="light-box" on:click={() => (active = !active)}>
      <iframe
        style="border: 1px solid rgba(0, 0, 0, 0.1);"
        width="100%"
        height="100%"
        src="https://www.figma.com/embed?embed_host=share&url=https%3A%2F%2Fwww.figma.com%2Fproto%2FGEmhtqmH0KbyOf2Si9efgw%2FPortfolio-2022%3Fpage-id%3D101%253A2099%26node-id%3D102%253A3104%26viewport%3D241%252C48%252C0.08%26scaling%3Dscale-down-width%26starting-point-node-id%3D102%253A3104"
        allowfullscreen
      />
    </div>
  {/if}
  <div class="case-study-section" id="three">
    <div class="case-container">
      <div class="case-image">
        <img class="screen-img" src="images/Screen.png" alt="" />
      </div>
      <div class="case-text">
        <div class="case-title">Ember Design Language System</div>
        <div class="case-description">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
          eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad
          minim veniam, quis nostrud exercitation ullamco laboris nisi ut
          aliquip ex ea commodo consequat.
        </div>
        <button on:click={() => (active = !active)}> More </button>
      </div>
    </div>
  </div>
  <div class="case-study-section" id="three">
    <div class="case-container">
      <div class="case-image">
        <img class="phone-img" src="images/phone-01.png" alt="" />
      </div>
      <div class="case-text">
        <div class="case-title">hi!Carnival</div>
        <div class="case-description">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
          eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad
          minim veniam, quis nostrud exercitation ullamco laboris nisi ut
          aliquip ex ea commodo consequat.
        </div>
        <button on:click={() => (active = !active)}> More </button>
      </div>
    </div>
  </div>

  <div class="case-study-section" id="three">
    <div class="case-container">
      <div class="case-image">
        <img class="phone-img" src="images/phone-02.png" alt="" />
      </div>
      <div class="case-text">
        <div class="case-title">StepUp</div>
        <div class="case-description">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
          eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad
          minim veniam, quis nostrud exercitation ullamco laboris nisi ut
          aliquip ex ea commodo consequat.
        </div>
        <button on:click={() => (active = !active)}> More </button>
      </div>
    </div>
  </div>
</section>

<style>
  section {
    height: auto;
    padding: 80px;
    padding-top: 0px;
    background-color: white;
  }
  button {
    padding: 4px 8px;
    margin: 16px 0px;
    font-family: "Barlow";
    transition: 0.2s all;
    border-radius: 4px;
  }
  button:hover {
    background-color: rgba(22, 22, 22, 0.9);
    color: white;
  }

  .case-study-section {
    font-weight: 100;
    font-size: 16px;
    line-height: 24px;
    text-align: center;
    padding: 40px;
    margin: auto;
    height: auto;
    width: 100vw;
  }
  .case-title {
    position: static;
    width: 455px;
    height: 128px;

    font-family: Playfair Display;
    font-style: normal;
    font-weight: bold;
    font-size: 48px;
    line-height: 50px;

    color: #000000;
  }

  .screen-img {
    width: 500px;
    box-shadow: rgba(100, 100, 111, 0.2) 0px 7px 29px 0px;
    transition: 0.3s all;
  }

  .phone-img {
    height: 500px;
    box-shadow: rgba(100, 100, 111, 0.2) 0px 7px 29px 0px;
    transition: 0.3s all;
  }
  .screen-img:hover {
    transform: translateY(-2px);
    box-shadow: rgba(50, 50, 93, 0.25) 0px 50px 100px -20px,
      rgba(0, 0, 0, 0.3) 0px 30px 60px -30px;
  }
  .phone-img:hover {
    transform: translateY(-2px);
    box-shadow: rgba(50, 50, 93, 0.25) 0px 50px 100px -20px,
      rgba(0, 0, 0, 0.3) 0px 30px 60px -30px;
  }
  .case-image {
    height: 100%;
    width: 50%;
    padding: 80px;
    text-align: center;
  }
  .case-text {
    height: 100%;
    width: 50%;
    max-width: 500px;
    padding: 80px;
  }
  .case-container {
    display: flex;
    max-width: 1200px;
    height: 100%;
    margin: auto;
    text-align: left;
    align-items: center;
  }
  .light-box {
    position: fixed;
    height: 100vh;
    width: 100%;
    background-color: rgba(1, 1, 1, 0.95);
    z-index: 100;
    top: 0px;
    margin: auto;
    padding: 40px;
    left: 0px;
    right: 0px;
  }
  .active {
    display: none;
  }
  iframe {
    border-radius: 24px;
  }
  .case-image img {
    border-radius: 16px;
  }
  @media only screen and (max-width: 800px) {
    section {
      padding: 0px;
    }
    iframe {
      border-radius: 0px;
    }
    .case-container {
      display: flex;
      max-width: 1200px;
      height: 100%;
      margin: auto;
      text-align: center;
      align-items: center;
      flex-direction: column;
    }
    .light-box {
      padding: 10px;
      padding-top: 20px;
      border-radius: 0px;
    }
    .case-text {
      width: 100%;
      padding: 40px;
      max-width: 100%;
    }
    .case-title {
      margin: auto;
      height: auto;
      max-width: calc(100vw - 80px);
    }
    .case-description {
      max-width: 600px;
      margin: auto;
      padding-top: 20px;
      max-width: calc(100vw - 80px);
    }
    .case-image {
      width: 100%;
      padding: 40px;
    }
    .screen-img {
      max-width: calc(100vw - 80px);
    }
  }
</style>
