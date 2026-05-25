import React, { useEffect, useRef, useState } from 'react';
import { motion, useInView, useMotionValue, useSpring, useTransform, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import * as THREE from 'three';

// ─── UTILS & MICRO-COMPONENTS ───────────────────────────────────────────────

function MagneticButton({ children, style, className }) {
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  const springConfig = { damping: 15, stiffness: 150, mass: 0.1 };
  const springX = useSpring(x, springConfig);
  const springY = useSpring(y, springConfig);

  const handleMouseMove = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    x.set((e.clientX - centerX) * 0.2);
    y.set((e.clientY - centerY) * 0.2);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ x: springX, y: springY, ...style }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function RevealText({ text, delay = 0, style }) {
  const words = text.split(" ");
  return (
    <span style={{ display: "inline-block", ...style }}>
      {words.map((word, i) => (
        <span key={i} style={{ display: "inline-block", overflow: "hidden", paddingRight: "0.25em" }}>
          <motion.span
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: delay + i * 0.05, ease: [0.33, 1, 0.68, 1] }}
            style={{ display: "inline-block" }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

function TiltCard({ children, style }) {
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  const springConfig = { damping: 20, stiffness: 100 };
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], ["7deg", "-7deg"]), springConfig);
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], ["-7deg", "7deg"]), springConfig);

  const handleMouseMove = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX, rotateY, perspective: 1000, ...style }}
    >
      {children}
    </motion.div>
  );
}

// ─── HERO FLOATING DATA CARDS ────────────────────────────────────────────────
function FloatingCards() {
  const [cards, setCards] = useState([]);
  
  useEffect(() => {
    const rawData = [
      { tag: 'SYS', msg: 'Normalising EBITDA to £2.4M', color: '#c9a84c' },
      { tag: 'ECRM', msg: 'Flagging GST mismatch: GSTR-3B', color: '#ef4444' },
      { tag: 'VAL', msg: 'Applying Damodaran illiquidity discount', color: '#3b82f6' },
      { tag: 'EXT', msg: 'Extracting Promoter Loans: ₹12.5 Cr', color: '#10b981' },
      { tag: 'SYS', msg: 'Generating draft Heads of Terms', color: '#8b5cf6' },
    ];
    
    let intervalId;
    let cardId = 0;
    
    const triggerCard = () => {
      const data = rawData[Math.floor(Math.random() * rawData.length)];
      const id = cardId++;
      const top = 15 + Math.random() * 70; // 15% to 85%
      const left = Math.random() > 0.5 ? 5 + Math.random() * 20 : 75 + Math.random() * 20; // edges
      
      setCards(prev => [...prev, { id, ...data, top: `${top}%`, left: `${left}%` }]);
      
      setTimeout(() => {
        setCards(prev => prev.filter(c => c.id !== id));
      }, 4000);
    };

    setTimeout(() => {
      triggerCard();
      intervalId = setInterval(triggerCard, 2500);
    }, 1500);
    
    return () => clearInterval(intervalId);
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1, overflow: 'hidden' }}>
      <AnimatePresence>
        {cards.map(card => (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              top: card.top,
              left: card.left,
              background: 'rgba(10, 10, 15, 0.6)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '6px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              transform: 'translate(-50%, -50%)',
              width: 'max-content'
            }}
          >
            <div style={{ fontSize: '9px', fontFamily: '"IBM Plex Mono", monospace', color: card.color, border: `1px solid ${card.color}40`, background: `${card.color}15`, padding: '2px 6px', borderRadius: '3px' }}>
              {card.tag}
            </div>
            <div style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '12px', color: '#e2e8f0', letterSpacing: '0.3px' }}>
              {card.msg}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── THREE.JS NETWORK GRAPH ──────────────────────────────────────────────────
function NetworkGraph() {
  const mountRef = useRef(null);

  useEffect(() => {
    let width = window.innerWidth;
    let height = window.innerHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0a0f, 0.0012);

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.z = 200;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    if (mountRef.current) {
      mountRef.current.appendChild(renderer.domElement);
    }

    // Nodes
    const particleCount = 200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 500;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 500;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 500;
      velocities.push({
        x: (Math.random() - 0.5) * 0.15,
        y: (Math.random() - 0.5) * 0.15,
        z: (Math.random() - 0.5) * 0.15,
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xc9a84c,
      size: 1.5,
      transparent: true,
      opacity: 0.6,
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // Lines
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.08,
    });

    const lineGeometry = new THREE.BufferGeometry();
    const linesMesh = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(linesMesh);

    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;

    const handleMouseMove = (e) => {
      mouseX = (e.clientX - width / 2) * 0.05;
      mouseY = (e.clientY - height / 2) * 0.05;
    };

    window.addEventListener('mousemove', handleMouseMove);

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    let animationFrameId;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      targetX = mouseX * 0.08;
      targetY = mouseY * 0.08;

      camera.position.x += (targetX - camera.position.x) * 0.02;
      camera.position.y += (-targetY - camera.position.y) * 0.02;
      camera.lookAt(scene.position);

      const pos = particles.geometry.attributes.position.array;
      let linePositions = [];

      for (let i = 0; i < particleCount; i++) {
        pos[i * 3] += velocities[i].x;
        pos[i * 3 + 1] += velocities[i].y;
        pos[i * 3 + 2] += velocities[i].z;

        if (Math.abs(pos[i * 3]) > 250) velocities[i].x *= -1;
        if (Math.abs(pos[i * 3 + 1]) > 250) velocities[i].y *= -1;
        if (Math.abs(pos[i * 3 + 2]) > 250) velocities[i].z *= -1;

        for (let j = i + 1; j < particleCount; j++) {
          const dx = pos[i * 3] - pos[j * 3];
          const dy = pos[i * 3 + 1] - pos[j * 3 + 1];
          const dz = pos[i * 3 + 2] - pos[j * 3 + 2];
          const distSq = dx * dx + dy * dy + dz * dz;

          if (distSq < 4000) {
            linePositions.push(
              pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2],
              pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]
            );
          }
        }
      }

      particles.geometry.attributes.position.needsUpdate = true;
      linesMesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));

      scene.rotation.y += 0.0005;
      scene.rotation.x += 0.0002;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (mountRef.current && renderer.domElement) {
        try { mountRef.current.removeChild(renderer.domElement); } catch (e) {}
      }
      geometry.dispose();
      material.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }} />;
}

// ─── NAVBAR ──────────────────────────────────────────────────────────────────
function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, width: '100%', zIndex: 100,
      padding: '24px 48px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      background: scrolled ? 'rgba(10, 10, 15, 0.7)' : 'transparent',
      backdropFilter: scrolled ? 'blur(20px) saturate(180%)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(255,255,255,0.03)' : '1px solid transparent'
    }}>
      <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: '26px', color: '#c9a84c', letterSpacing: '0.5px' }}>
        Deal OS
      </div>
      <div style={{ display: 'flex', gap: '40px', alignItems: 'center', fontFamily: '"DM Sans", sans-serif', fontSize: '14px', fontWeight: 500 }}>
        <a href="#workflow" style={{ color: '#a0a0ab', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = '#fff'} onMouseOut={e => e.target.style.color = '#a0a0ab'}>Platform</a>
        <a href="#pricing" style={{ color: '#a0a0ab', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = '#fff'} onMouseOut={e => e.target.style.color = '#a0a0ab'}>Pricing</a>
        <Link to="/login" style={{ color: '#fff', textDecoration: 'none' }}>Sign in</Link>
        <MagneticButton>
          <Link to="/signup" style={{
            background: 'linear-gradient(135deg, #d4b45d 0%, #b39132 100%)', color: '#0a0a0f', padding: '12px 24px', borderRadius: '4px', fontWeight: 600, textDecoration: 'none',
            boxShadow: '0 4px 14px 0 rgba(201, 168, 76, 0.39)'
          }}>
            Get Access
          </Link>
        </MagneticButton>
      </div>
    </nav>
  );
}

export default function Landing() {
  return (
    <div style={{ backgroundColor: '#0a0a0f', color: '#fff', minHeight: '100vh', overflowX: 'hidden' }}>
      <Navbar />

      {/* SECTION 1 - HERO */}
      <section style={{ position: 'relative', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% -20%, rgba(201, 168, 76, 0.15), transparent 60%)', zIndex: 0 }} />
        <NetworkGraph />
        <FloatingCards />
        
        <div style={{ position: 'relative', zIndex: 10, maxWidth: '900px', padding: '0 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.1, ease: 'easeOut' }}>
            <div style={{ 
              fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', color: '#c9a84c', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '32px',
              border: '1px solid rgba(201,168,76,0.3)', padding: '6px 16px', borderRadius: '100px', background: 'rgba(201,168,76,0.05)', backdropFilter: 'blur(10px)'
            }}>
              Private Market Intelligence
            </div>
          </motion.div>
          
          <h1 style={{ fontFamily: '"DM Serif Display", serif', fontSize: '80px', lineHeight: 1.05, marginBottom: '32px', letterSpacing: '-1px' }}>
            <RevealText text="From Information Memorandum" delay={0.2} />
            <br />
            <RevealText text="to investment decision." delay={0.4} />
            <br />
            <motion.span initial={{ opacity: 0, filter: 'blur(10px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ delay: 1.2, duration: 1 }} style={{ color: '#c9a84c', fontStyle: 'italic' }}>
              In 2 minutes.
            </motion.span>
          </h1>
          
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 1.4 }} style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '18px', color: '#a0a0ab', maxWidth: '600px', margin: '0 auto 48px', lineHeight: 1.6 }}>
            Deal OS analyses private company IMs end to end — structuring financials, benchmarking valuations, and flagging regulatory risks. Move on deals before the competition even opens the PDF.
          </motion.p>
          
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 1.6 }} style={{ display: 'flex', gap: '20px', justifyContent: 'center', alignItems: 'center' }}>
            <MagneticButton>
              <Link to="/signup" style={{ 
                display: 'inline-block',
                background: 'linear-gradient(135deg, #d4b45d 0%, #b39132 100%)', 
                color: '#0a0a0f', 
                padding: '16px 36px', 
                borderRadius: '4px', 
                fontWeight: 600, 
                fontSize: '15px', 
                fontFamily: '"DM Sans", sans-serif', 
                textDecoration: 'none',
                boxShadow: '0 10px 30px -10px rgba(201, 168, 76, 0.6)'
              }}>
                Start Free Trial
              </Link>
            </MagneticButton>
            <MagneticButton>
              <a href="#workflow" style={{ 
                display: 'inline-block',
                background: 'rgba(255,255,255,0.03)', 
                border: '1px solid rgba(255,255,255,0.1)', 
                color: '#fff', 
                padding: '16px 36px', 
                borderRadius: '4px', 
                fontWeight: 600, 
                fontSize: '15px', 
                fontFamily: '"DM Sans", sans-serif', 
                textDecoration: 'none',
                backdropFilter: 'blur(10px)'
              }}>
                Explore Platform
              </a>
            </MagneticButton>
          </motion.div>
        </div>
        
        {/* Bottom fade */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '200px', background: 'linear-gradient(to bottom, transparent, #050508)', zIndex: 5 }} />
      </section>

      {/* SECTION 2 - STICKY NARRATIVE */}
      <section style={{ backgroundColor: '#050508', position: 'relative' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', position: 'relative' }}>
          
          {/* Left Pinned Side */}
          <div style={{ width: '50%', padding: '160px 80px', position: 'sticky', top: 0, height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, margin: '-20%' }} transition={{ duration: 1 }}>
              <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: '64px', lineHeight: 1.1, marginBottom: '24px' }}>
                The solo deal workflow <br/><span style={{ color: '#c9a84c', fontStyle: 'italic' }}>is broken.</span>
              </h2>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '18px', color: '#a0a0ab', lineHeight: 1.6, maxWidth: '400px' }}>
                Acquisition entrepreneurs spend their most valuable resource — time — doing data entry instead of building relationships.
              </p>
            </motion.div>
          </div>

          {/* Right Scrolling Side */}
          <div style={{ width: '50%', padding: '160px 80px 160px 0', display: 'flex', flexDirection: 'column', gap: '30vh' }}>
            
            <motion.div initial={{ opacity: 0, x: 50 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-20%' }} transition={{ duration: 0.8 }} style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '-40px', top: 0, bottom: 0, width: '1px', background: 'linear-gradient(to bottom, #c9a84c, transparent)' }} />
              <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '120px', lineHeight: 0.8, color: 'transparent', WebkitTextStroke: '1px rgba(255,255,255,0.1)', marginBottom: '24px' }}>01</div>
              <h3 style={{ fontFamily: '"DM Serif Display", serif', fontSize: '32px', marginBottom: '16px' }}>4 Hours Per IM</h3>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '16px', color: '#a0a0ab', lineHeight: 1.6 }}>
                Reading 40-page PDFs, hunting for add-backs, and manually structuring balance sheet data into Excel. Deal OS extracts 35 structured financial fields instantly.
              </p>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 50 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-20%' }} transition={{ duration: 0.8 }} style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '-40px', top: 0, bottom: 0, width: '1px', background: 'linear-gradient(to bottom, #c9a84c, transparent)' }} />
              <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '120px', lineHeight: 0.8, color: 'transparent', WebkitTextStroke: '1px rgba(255,255,255,0.1)', marginBottom: '24px' }}>02</div>
              <h3 style={{ fontFamily: '"DM Serif Display", serif', fontSize: '32px', marginBottom: '16px' }}>Blind Valuation</h3>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '16px', color: '#a0a0ab', lineHeight: 1.6 }}>
                Guessing multiples. Deal OS runs a 4-method BAUS valuation engine benchmarked against live Damodaran sector data with built-in private market illiquidity discounts.
              </p>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 50 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-20%' }} transition={{ duration: 0.8 }} style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '-40px', top: 0, bottom: 0, width: '1px', background: 'linear-gradient(to bottom, #c9a84c, transparent)' }} />
              <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '120px', lineHeight: 0.8, color: 'transparent', WebkitTextStroke: '1px rgba(255,255,255,0.1)', marginBottom: '24px' }}>03</div>
              <h3 style={{ fontFamily: '"DM Serif Display", serif', fontSize: '32px', marginBottom: '16px' }}>Compliance Ambush</h3>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '16px', color: '#a0a0ab', lineHeight: 1.6 }}>
                Missing a related-party loan or an HMRC dispute buried in Note 14. Deal OS automatically screens 9 ECRM risk categories universally, plus local registry rules.
              </p>
            </motion.div>

          </div>
        </div>
      </section>

      {/* SECTION 3 - BENTO BOX WORKFLOW */}
      <section id="workflow" style={{ padding: '160px 0', backgroundColor: '#0a0a0f', position: 'relative' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 40px' }}>
          <div style={{ textAlign: 'center', marginBottom: '80px' }}>
            <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: '56px', marginBottom: '24px' }}>The Intelligence Engine</h2>
            <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '18px', color: '#a0a0ab', maxWidth: '600px', margin: '0 auto' }}>
              We don't just summarise text. We build structured financial models and run institutional-grade logic checks directly from the source document.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '24px', gridAutoRows: 'minmax(300px, auto)' }}>
            
            {/* Box 1: Extraction */}
            <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} 
              style={{ gridColumn: 'span 8', background: '#0d1117', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '40px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'relative', zIndex: 10 }}>
                <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '12px', color: '#c9a84c', marginBottom: '16px' }}>01 / FINANCIAL EXTRACTION</div>
                <h3 style={{ fontFamily: '"DM Serif Display", serif', fontSize: '32px', marginBottom: '16px' }}>Deterministic Parsing</h3>
                <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '16px', color: '#a0a0ab', maxWidth: '350px', lineHeight: 1.6 }}>
                  Revenue, EBITDA, Capex, and Net Assets. 35 variables extracted and cross-validated against built-in accounting heuristics.
                </p>
              </div>
              
              {/* Abstract UI: JSON block */}
              <div style={{ position: 'absolute', right: '-40px', top: '20px', width: '400px', background: '#050508', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '24px', fontFamily: '"IBM Plex Mono", monospace', fontSize: '12px', color: '#64748b', transform: 'rotate(5deg)' }}>
                <div><span style={{color:'#c9a84c'}}>const</span> <span style={{color:'#38bdf8'}}>financials</span> = {'{'}</div>
                <div style={{paddingLeft: '16px'}}>revenue: <span style={{color:'#a3e635'}}>14250000</span>,</div>
                <div style={{paddingLeft: '16px'}}>ebitda_reported: <span style={{color:'#a3e635'}}>2400000</span>,</div>
                <div style={{paddingLeft: '16px'}}>profit_before_tax: <span style={{color:'#a3e635'}}>1850000</span>,</div>
                <div style={{paddingLeft: '16px'}}>trade_debtors: <span style={{color:'#a3e635'}}>310000</span>,</div>
                <div style={{paddingLeft: '16px'}}>net_assets: <span style={{color:'#a3e635'}}>4200000</span></div>
                <div>{'}'};</div>
                <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 2 }} style={{ marginTop: '16px', color: '#10b981' }}>
                  ✓ Passed margin consistency check
                </motion.div>
              </div>
            </motion.div>

            {/* Box 2: ECRM */}
            <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.2 }} 
              style={{ gridColumn: 'span 4', background: '#0d1117', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '40px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '12px', color: '#ef4444', marginBottom: '16px' }}>02 / ECRM RISK SCREEN</div>
              <h3 style={{ fontFamily: '"DM Serif Display", serif', fontSize: '32px', marginBottom: '16px' }}>Radar</h3>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '16px', color: '#a0a0ab', lineHeight: 1.6 }}>
                Deep scans of footnotes for related party loans, HMRC investigations, and director disqualifications.
              </p>
              <div style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '12px', borderRadius: '6px', color: '#fca5a5', fontSize: '11px', fontFamily: '"IBM Plex Mono", monospace' }}>
                  [HIGH] HMRC VAT Discrepancy Found
                </div>
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '12px', borderRadius: '6px', color: '#6ee7b7', fontSize: '11px', fontFamily: '"IBM Plex Mono", monospace' }}>
                  [CLEAN] No Director Loans Detected
                </div>
              </div>
            </motion.div>

            {/* Box 3: Valuation */}
            <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} 
              style={{ gridColumn: 'span 12', background: 'radial-gradient(circle at 80% 50%, rgba(201, 168, 76, 0.1), #0d1117 70%)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '60px', display: 'flex', alignItems: 'center', gap: '80px' }}>
              
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '12px', color: '#c9a84c', marginBottom: '16px' }}>03 / VALUATION ENGINE</div>
                <h3 style={{ fontFamily: '"DM Serif Display", serif', fontSize: '48px', marginBottom: '16px' }}>BAUS Methodology</h3>
                <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '18px', color: '#a0a0ab', lineHeight: 1.6, maxWidth: '400px' }}>
                  A sophisticated four-pillar valuation composite. We calculate Build-up, Underlying Earnings, Asset Floor, and Downside Sensitivity to give you a highly defensible bidding range.
                </p>
              </div>

              {/* Abstract UI: Valuation Chart */}
              <div style={{ flex: 1, height: '200px', display: 'flex', alignItems: 'flex-end', gap: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '20px', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '20px', left: 0, right: 0, borderTop: '1px dashed rgba(201,168,76,0.4)', color: '#c9a84c', fontSize: '10px', fontFamily: '"IBM Plex Mono", monospace', paddingTop: '4px' }}>ASKING PRICE: £15.0M</div>
                
                <motion.div initial={{ height: 0 }} whileInView={{ height: '70%' }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.2 }} style={{ flex: 1, background: '#1e293b', borderTop: '2px solid #3b82f6' }}><div style={{textAlign:'center', marginTop:'-24px', fontSize:'11px', fontFamily:'"IBM Plex Mono", monospace', color:'#94a3b8'}}>Build-up</div></motion.div>
                <motion.div initial={{ height: 0 }} whileInView={{ height: '85%' }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.4 }} style={{ flex: 1, background: '#1e293b', borderTop: '2px solid #10b981' }}><div style={{textAlign:'center', marginTop:'-24px', fontSize:'11px', fontFamily:'"IBM Plex Mono", monospace', color:'#94a3b8'}}>Underlying</div></motion.div>
                <motion.div initial={{ height: 0 }} whileInView={{ height: '40%' }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.6 }} style={{ flex: 1, background: '#1e293b', borderTop: '2px solid #8b5cf6' }}><div style={{textAlign:'center', marginTop:'-24px', fontSize:'11px', fontFamily:'"IBM Plex Mono", monospace', color:'#94a3b8'}}>Asset Floor</div></motion.div>
                <motion.div initial={{ height: 0 }} whileInView={{ height: '55%' }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.8 }} style={{ flex: 1, background: '#1e293b', borderTop: '2px solid #ef4444' }}><div style={{textAlign:'center', marginTop:'-24px', fontSize:'11px', fontFamily:'"IBM Plex Mono", monospace', color:'#94a3b8'}}>Downside</div></motion.div>
                
                <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 1.5 }} style={{ position: 'absolute', bottom: '80px', left: '20%', right: '20%', height: '40px', background: 'rgba(201,168,76,0.15)', border: '1px solid #c9a84c', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
                  <span style={{ color: '#c9a84c', fontSize: '12px', fontFamily: '"IBM Plex Mono", monospace', fontWeight: 'bold' }}>FAIR VALUE: £11.2M - £12.8M</span>
                </motion.div>
              </div>

            </motion.div>

          </div>
        </div>
      </section>

      {/* SECTION 4 - GEOGRAPHY (EDITORIAL) */}
      <section style={{ padding: '160px 0', backgroundColor: '#050508' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 40px' }}>
          <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: '56px', marginBottom: '80px', textAlign: 'center' }}>
            Built for your jurisdiction.
          </h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.05)' }}>
            
            {/* UK */}
            <div style={{ background: '#0a0a0f', padding: '60px 40px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: '-20px', right: '-20px', fontSize: '240px', fontFamily: '"DM Serif Display", serif', color: 'rgba(255,255,255,0.02)', lineHeight: 1, pointerEvents: 'none' }}>£</div>
              <div style={{ fontSize: '40px', marginBottom: '24px' }}>🇬🇧</div>
              <h3 style={{ fontFamily: '"DM Serif Display", serif', fontSize: '28px', marginBottom: '24px' }}>United Kingdom</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontFamily: '"DM Sans", sans-serif', fontSize: '15px', color: '#a0a0ab', lineHeight: 1.8 }}>
                <li><strong style={{color:'#fff'}}>ECRM:</strong> Companies House, HMRC, VAT/PAYE arrears, Director Disqualification</li>
                <li><strong style={{color:'#fff'}}>Legal:</strong> Heads of Terms (English Law)</li>
                <li><strong style={{color:'#fff'}}>Market:</strong> Damodaran UK / GBP</li>
              </ul>
            </div>

            {/* INDIA */}
            <div style={{ background: '#0a0a0f', padding: '60px 40px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: '-20px', right: '-20px', fontSize: '240px', fontFamily: '"DM Sans", sans-serif', color: 'rgba(201,168,76,0.03)', lineHeight: 1, pointerEvents: 'none' }}>₹</div>
              <div style={{ fontSize: '40px', marginBottom: '24px' }}>🇮🇳</div>
              <h3 style={{ fontFamily: '"DM Serif Display", serif', fontSize: '28px', marginBottom: '24px', color: '#c9a84c' }}>India</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontFamily: '"DM Sans", sans-serif', fontSize: '15px', color: '#a0a0ab', lineHeight: 1.8 }}>
                <li><strong style={{color:'#c9a84c'}}>ECRM:</strong> GSTIN, MCA/ROC filings, Promoter Loans, HUF structures, PF/ESIC</li>
                <li><strong style={{color:'#c9a84c'}}>Legal:</strong> MoU (Indian Contract Act)</li>
                <li><strong style={{color:'#c9a84c'}}>Formatting:</strong> INR Crore/Lakh scaling</li>
              </ul>
            </div>

            {/* UAE */}
            <div style={{ background: '#0a0a0f', padding: '60px 40px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: '-20px', right: '-20px', fontSize: '240px', fontFamily: '"DM Serif Display", serif', color: 'rgba(255,255,255,0.02)', lineHeight: 1, pointerEvents: 'none' }}>د.إ</div>
              <div style={{ fontSize: '40px', marginBottom: '24px' }}>🇦🇪</div>
              <h3 style={{ fontFamily: '"DM Serif Display", serif', fontSize: '28px', marginBottom: '24px' }}>UAE</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontFamily: '"DM Sans", sans-serif', fontSize: '15px', color: '#a0a0ab', lineHeight: 1.8 }}>
                <li><strong style={{color:'#fff'}}>ECRM:</strong> DIFC Compliance, UBO disclosure, Free zone vs Mainland structs</li>
                <li><strong style={{color:'#fff'}}>Legal:</strong> Coming Q3 2026</li>
                <li><strong style={{color:'#fff'}}>Currency:</strong> AED / USD multi-currency</li>
              </ul>
            </div>

          </div>
        </div>
      </section>

      {/* SECTION 5 - WORKFLOW PACE (BEFORE / AFTER) */}
      <section style={{ backgroundColor: '#0a0a0f', padding: '160px 0', position: 'relative', overflow: 'hidden' }}>
        {/* Subtle glowing grid background */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '50px 50px', opacity: 0.5 }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(201,168,76,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />
        
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 40px', position: 'relative', zIndex: 10 }}>
          <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: '48px', textAlign: 'center', marginBottom: '80px' }}>
            Asymmetrical leverage.
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '80px', background: '#050508', border: '1px solid rgba(255,255,255,0.05)', padding: '60px', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
            
            {/* MANUAL TRACK */}
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontFamily: '"IBM Plex Mono", monospace', fontSize: '12px', color: '#64748b', letterSpacing: '1px' }}>
                <span>THE OLD WAY</span>
                <span>4-6 HOURS</span>
              </div>
              <div style={{ position: 'relative', height: '16px', background: '#0a0a0f', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                <motion.div initial={{ width: 0 }} whileInView={{ width: '25%' }} viewport={{ once: true }} transition={{ duration: 2.5, ease: 'easeOut' }} style={{ height: '100%', background: 'linear-gradient(90deg, #1e293b, #334155)', borderRadius: '8px' }} />
                
                {/* Checkpoints */}
                <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', alignItems: 'center', justifyItems: 'center' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                </div>
              </div>
              
              {/* DEAL LOST BADGE */}
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.9 }} 
                whileInView={{ opacity: 1, y: 0, scale: 1 }} 
                viewport={{ once: true }} 
                transition={{ duration: 0.5, delay: 2.5, type: 'spring' }} 
                style={{ position: 'absolute', left: '27%', top: '30px', background: '#ef4444', color: '#fff', padding: '4px 10px', borderRadius: '4px', fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.5px', boxShadow: '0 4px 12px rgba(239,68,68,0.4)', zIndex: 20 }}
              >
                DEAL LOST TO COMPETITOR
              </motion.div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', marginTop: '16px', fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: '#475569', textAlign: 'center' }}>
                <span>Read 40-page IM</span>
                <motion.span initial={{ opacity: 1 }} whileInView={{ opacity: 0.3 }} viewport={{ once: true }} transition={{ delay: 2.5, duration: 0.5 }}>Hunt for add-backs</motion.span>
                <motion.span initial={{ opacity: 1 }} whileInView={{ opacity: 0.3 }} viewport={{ once: true }} transition={{ delay: 2.5, duration: 0.5 }}>Build Excel model</motion.span>
                <motion.span initial={{ opacity: 1 }} whileInView={{ opacity: 0.3 }} viewport={{ once: true }} transition={{ delay: 2.5, duration: 0.5 }}>Google directors</motion.span>
              </div>
            </div>

            {/* DEAL OS TRACK */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontFamily: '"IBM Plex Mono", monospace', fontSize: '12px', color: '#c9a84c', letterSpacing: '1px', fontWeight: 'bold' }}>
                <span>DEAL OS</span>
                <span>2 MINUTES</span>
              </div>
              <div style={{ position: 'relative', height: '16px', background: '#0a0a0f', borderRadius: '8px', border: '1px solid rgba(201,168,76,0.3)', overflow: 'hidden' }}>
                <motion.div initial={{ width: 0 }} whileInView={{ width: ['0%', '25%', '25%', '50%', '50%', '75%', '75%', '100%'] }} viewport={{ once: true }} transition={{ duration: 1.5, times: [0, 0.15, 0.25, 0.4, 0.5, 0.65, 0.75, 1], ease: 'easeInOut' }} style={{ height: '100%', background: 'linear-gradient(90deg, #b39132, #d4b45d)', borderRadius: '8px', boxShadow: '0 0 20px rgba(201,168,76,0.5)' }} />
                
                {/* Checkpoints */}
                <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', alignItems: 'center', justifyItems: 'center' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(0,0,0,0.3)' }} />
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(0,0,0,0.3)' }} />
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(0,0,0,0.3)' }} />
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(0,0,0,0.3)' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', marginTop: '16px', fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: '#c9a84c', textAlign: 'center' }}>
                <span>Upload PDF</span>
                <span>Instant Extraction</span>
                <span>BAUS Valuation</span>
                <span>Deal Package Ready</span>
              </div>
            </div>

          </div>
          
          <div style={{ marginTop: '60px', textAlign: 'center' }}>
             <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '17px', color: '#a0a0ab', lineHeight: 1.6, maxWidth: '700px', margin: '0 auto' }}>
              Whether you are a <span style={{ color: '#fff', fontWeight: 500 }}>Search Fund Principal</span>, an <span style={{ color: '#fff', fontWeight: 500 }}>Independent Sponsor</span>, or a <span style={{ color: '#fff', fontWeight: 500 }}>Boutique M&A Adviser</span> — time is your bottleneck. Deal OS removes it, allowing you to underwrite 5x more deals and outpace competing buyers.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 6 - PRICING */}
      <section id="pricing" style={{ backgroundColor: '#050508', padding: '160px 0' }}>
        <div style={{ maxWidth: '1300px', margin: '0 auto', padding: '0 40px' }}>
          <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: '56px', textAlign: 'center', marginBottom: '80px' }}>
            Institutional tools.<br/>Independent pricing.
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', justifyContent: 'center', alignItems: 'stretch' }}>
            {[
              { name: 'Starter', price: '£149', period: '/ month', target: 'Self-funded searchers', features: ['15 full analyses per month', 'All 5 OS modules', 'UK & India data structuring', '7-day free trial'], cta: 'Start Free Trial', highlight: false },
              { name: 'Pro', price: '£299', period: '/ month', target: 'Active independent sponsors', features: ['Unlimited analyses', 'Global geography access', 'Priority API support', 'Historical deal vault'], cta: 'Start Free Trial', highlight: true },
              { name: 'Pay Per Deal', price: '£149', period: '/ deal', target: 'One-off users', features: ['Single full analysis run', 'No recurring subscription', 'Valid for 30 days', ''], cta: 'Buy Analysis', highlight: false }
            ].map((plan, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                style={{ 
                  background: plan.highlight ? 'radial-gradient(circle at top right, rgba(201,168,76,0.15), #0a0a0f 80%)' : '#0a0a0f', 
                  border: plan.highlight ? '1px solid rgba(201,168,76,0.5)' : '1px solid rgba(255,255,255,0.05)',
                  borderRadius: '12px',
                  padding: plan.highlight ? '56px 40px' : '48px 40px',
                  width: '340px',
                  position: 'relative',
                  boxShadow: plan.highlight ? '0 20px 40px rgba(0,0,0,0.6)' : 'none'
                }}
              >
                {plan.highlight && (
                  <div style={{ position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)', background: '#c9a84c', color: '#0a0a0f', padding: '6px 16px', borderRadius: '100px', fontSize: '11px', fontWeight: 'bold', fontFamily: '"IBM Plex Mono", monospace', letterSpacing: '1px' }}>
                    RECOMMENDED
                  </div>
                )}
                <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: '28px', marginBottom: '8px' }}>{plan.name}</div>
                <div style={{ marginBottom: '12px' }}>
                  <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '40px', color: plan.highlight ? '#c9a84c' : '#fff' }}>{plan.price}</span>
                  <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '16px', color: '#a0a0ab' }}>{plan.period}</span>
                </div>
                <div style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '14px', color: '#64748b', marginBottom: '40px' }}>{plan.target}</div>
                
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 40px', minHeight: '140px' }}>
                  {plan.features.map((f, fi) => f && (
                    <li key={fi} style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '15px', color: 'rgba(255,255,255,0.8)', marginBottom: '16px', display: 'flex', gap: '12px' }}>
                      <span style={{ color: '#c9a84c' }}>✦</span> {f}
                    </li>
                  ))}
                </ul>
                
                <MagneticButton>
                  <Link to="/signup" style={{ 
                    display: 'block', textAlign: 'center', 
                    background: plan.highlight ? '#c9a84c' : 'rgba(255,255,255,0.05)', 
                    color: plan.highlight ? '#0a0a0f' : '#fff', 
                    border: plan.highlight ? 'none' : '1px solid rgba(255,255,255,0.1)',
                    padding: '16px 0', borderRadius: '4px', fontWeight: 600, fontSize: '15px', fontFamily: '"DM Sans", sans-serif', textDecoration: 'none',
                    transition: 'background 0.2s'
                  }}>
                    {plan.cta}
                  </Link>
                </MagneticButton>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 7 - FINAL CTA (CINEMATIC) */}
      <section style={{ 
        position: 'relative', 
        height: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        textAlign: 'center',
        background: '#0a0a0f',
        overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, rgba(201, 168, 76, 0.1) 0%, #0a0a0f 70%)', zIndex: 0 }} />
        
        <div style={{ position: 'relative', zIndex: 10, padding: '0 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}>
            <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: '72px', lineHeight: 1.1, marginBottom: '32px', maxWidth: '900px', margin: '0 auto 32px' }}>
              The next deal in your inbox deserves a <span style={{ color: '#c9a84c', fontStyle: 'italic' }}>proper analysis.</span>
            </h2>
            <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '20px', color: '#a0a0ab', marginBottom: '48px' }}>
              Upload your first IM free. No setup. No credit card.
            </p>
            <MagneticButton>
              <Link to="/signup" style={{ display: 'inline-block', background: 'linear-gradient(135deg, #d4b45d 0%, #b39132 100%)', color: '#0a0a0f', padding: '20px 48px', borderRadius: '4px', fontWeight: 600, fontSize: '18px', fontFamily: '"DM Sans", sans-serif', textDecoration: 'none', marginBottom: '32px', boxShadow: '0 10px 40px rgba(201, 168, 76, 0.4)' }}>
                Start Free Trial
              </Link>
            </MagneticButton>
            <div>
              <Link to="/login" style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '15px', color: '#64748b', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = '#fff'} onMouseOut={e => e.target.style.color = '#64748b'}>
                Already have an account? <span style={{ color: '#fff', textDecoration: 'underline' }}>Sign in</span>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ backgroundColor: '#000', padding: '80px 40px 40px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '40px' }}>
          <div>
            <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: '32px', color: '#c9a84c', marginBottom: '16px' }}>Deal OS</div>
            <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '15px', color: '#64748b', marginBottom: '24px', maxWidth: '300px' }}>
              The private market deal analysis infrastructure. Built for operators.
            </p>
            <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>
              UNITED KINGDOM · INDIA · UAE
            </div>
            <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
              <a href="https://x.com/Siddharthbatman" target="_blank" rel="noopener noreferrer" style={{ color: '#64748b', transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color = '#fff'} onMouseOut={e => e.currentTarget.style.color = '#64748b'}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a href="https://www.linkedin.com/in/siddharth-padigar-590406213/" target="_blank" rel="noopener noreferrer" style={{ color: '#64748b', transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color = '#fff'} onMouseOut={e => e.currentTarget.style.color = '#64748b'}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                </svg>
              </a>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '60px', fontFamily: '"DM Sans", sans-serif', fontSize: '15px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', color: '#fff', letterSpacing: '1px', marginBottom: '8px' }}>PLATFORM</div>
              <a href="#workflow" style={{ color: '#64748b', textDecoration: 'none' }}>Workflow</a>
              <a href="#pricing" style={{ color: '#64748b', textDecoration: 'none' }}>Pricing</a>
              <Link to="/login" style={{ color: '#64748b', textDecoration: 'none' }}>Sign In</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', color: '#fff', letterSpacing: '1px', marginBottom: '8px' }}>LEGAL</div>
              <Link to="/privacy" style={{ color: '#64748b', textDecoration: 'none' }}>Privacy Policy</Link>
              <Link to="/terms" style={{ color: '#64748b', textDecoration: 'none' }}>Terms of Service</Link>
              <a href="mailto:siddharthpadigar22@gmail.com" style={{ color: '#64748b', textDecoration: 'none' }}>Contact</a>
            </div>
          </div>
        </div>
        <div style={{ maxWidth: '1400px', margin: '80px auto 0', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>
            © 2026 CLEARLINE CAPITAL. ALL RIGHTS RESERVED.
          </div>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>
            SYSTEM STATUS: <span style={{ color: '#10b981' }}>OPERATIONAL</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
