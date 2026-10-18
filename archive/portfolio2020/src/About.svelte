<script>
  import RadialInterface from "./RadialInterface.svelte";
</script>

<section class="section-03" id="three">
  <div class="about-container">
    <div class=" title">
      Designing and maintaining <br /> meaningful User experiences
    </div>

    <div class="svg-padding">
      <svg
        width="30"
        height="1"
        viewBox="0 0 30 1"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <line y1="0.5" x2="30" y2="0.5" stroke="black" />
      </svg>
    </div>
    <div class="about-text">
      For 4 years now, I had the pleasure of working in MNCs and Goverment
      services to provide design and creative technological service to build
      products ranging from small gamification projects to large scale Design
      Systems. I’ve been involved in variety of projectd in the area of
      prototyping, user experience design, research and design operations.
    </div>
    <div class="svg-padding">
      <svg
        width="1"
        height="120"
        viewBox="0 0 1 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <line x1="0.5" y1="2.18557e-08" x2="0.499995" y2="120" stroke="black" />
      </svg>
    </div>
  </div>
</section>

<style>
  section {
    height: auto;
    padding: 80px;
    background-color: white;
  }
  .svg-padding {
    margin-top: 40px;
    margin-bottom: 40px;
  }
  .title {
    display: flex;
    flex-direction: column;
    position: relative;
    height: 100%;
    top: 10px;
    text-align: center;
    color: black;
    margin-bottom: 20px;
  }
  .about-text {
    max-width: 600px;
    font-weight: 100;
    font-size: 16px;
    line-height: 24px;
    text-align: center;
    color: black;
    margin: auto;
  }
  .about-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  section.section-03 {
    display: flex;
    justify-content: center;
    align-items: center;
    font-family: "Barlow";
    font-style: normal;
  }

  @media only screen and (max-width: 800px) {
    .about-container {
      display: flex;
      height: 100%;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin-top: -100px;
      padding: 20px;
    }

    .about-text {
      margin: auto;
      width: calc(100vw - 80px);
    }
  }
</style>
