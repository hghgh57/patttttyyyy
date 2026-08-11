const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const config = require('../config.json');
const { isAdmin } = require('../utils/permissions');
const { sanitizeEmoji } = require('../utils/emoji');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-panel-custom')
    .setDescription('Post the ticket panel built with /ticket-setup'),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    const customCategories = config.customCategories || [];

    if (customCategories.length === 0) {
      return interaction.reply({
        content: "You haven't built a custom panel yet — run `/ticket-setup` first.",
        ephemeral: true,
      });
    }

    const customPanel = config.customPanel || {};

    const embed = new EmbedBuilder()
      .setDescription(customPanel.description || 'Select an option below to open a ticket.')
      .setColor(customPanel.color || '#5865F2');
    if (customPanel.title) embed.setTitle(customPanel.title);

    if (config.logoUrl && !config.logoUrl.startsWith('PUT_')) {
      embed.setAuthor({ name: customPanel.title || 'Support', iconURL: config.logoUrl });
      embed.setThumbnail(config.logoUrl);
    }

    const style = customPanel.style || 'dropdown';
    const components = [];

    if (style === 'buttons') {
      let row = new ActionRowBuilder();
      customCategories.forEach((cat, i) => {
        if (i > 0 && i % 5 === 0) {
          components.push(row);
          row = new ActionRowBuilder();
        }
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket_open_${cat.id}`)
            .setLabel(cat.label)
            .setEmoji(sanitizeEmoji(cat.emoji))
            .setStyle(ButtonStyle.Primary)
        );
      });
      components.push(row);
    } else {
      const menu = new StringSelectMenuBuilder()
        .setCustomId('ticket_category_select')
        .setPlaceholder('Select a ticket category…')
        .addOptions(
          customCategories.map((cat) => ({
            label: cat.label,
            description: (cat.description || '').slice(0, 100),
            value: cat.id,
            emoji: sanitizeEmoji(cat.emoji),
          }))
        );
      components.push(new ActionRowBuilder().addComponents(menu));
    }

    await interaction.channel.send({ embeds: [embed], components });
    await interaction.reply({ content: 'Custom ticket panel posted.', ephemeral: true });
  },
};
